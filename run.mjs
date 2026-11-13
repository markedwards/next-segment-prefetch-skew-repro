// Builds the app twice (deployments A and B), serves both behind one front
// proxy, and drives a browser through two version-skew scenarios.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { chromium } from "playwright";

const PORTS = { a: 3101, b: 3102 };
const FRONT = 3100;
const base = `http://127.0.0.1:${FRONT}`;
const next = "node_modules/.bin/next";

mkdirSync("app/_gen", { recursive: true });
for (const id of ["a", "b"]) {
  // The two builds differ only in the directory of one dependency.
  writeFileSync("app/_gen/dep.js", `export { label } from "../../vendor-${id}/dep";\n`);
  execFileSync(next, ["build"], {
    env: { ...process.env, DEPLOY_ID: id.toUpperCase(), DIST_DIR: `.next-${id}` },
    stdio: "ignore",
  });
}
const servers = ["a", "b"].map((id) =>
  spawn(next, ["start", "-p", String(PORTS[id])], {
    env: { ...process.env, DEPLOY_ID: id.toUpperCase(), DIST_DIR: `.next-${id}` },
    stdio: "ignore",
  }),
);

// Front proxy: stands in for a load balancer during a rolling deployment.
// `route` decides which deployment answers a request. Static files are served
// from whichever deployment has them, like a CDN that keeps old assets.
let route = () => "a";
const forward = (req, res, port, onMissing) => {
  const upstream = http.request(
    { host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      if (up.statusCode === 404 && onMissing) {
        up.resume();
        return onMissing();
      }
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
};
const front = http
  .createServer((req, res) => {
    if (req.url.startsWith("/_next/static/")) {
      return forward(req, res, PORTS.a, () => forward(req, res, PORTS.b));
    }
    forward(req, res, PORTS[route(req)]);
  })
  .listen(FRONT);

const isSegmentDataPrefetch = (req) =>
  req.headers.rsc === "1" &&
  req.headers["next-router-prefetch"] === "1" &&
  req.headers["next-router-segment-prefetch"] !== "/_tree";

const waitForServer = async (port) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server on ${port} did not start`);
};

const scenario = async (browser, own, other, finish) => {
  const page = await browser.newPage();
  const foreignChunks = [];
  page.on("response", (response) => {
    const match = response.url().match(/\/_next\/static\/chunks\/(.+)\?dpl=(.)/);
    if (match && match[2] !== own.toUpperCase()) foreignChunks.push(match[1]);
  });
  route = () => own;
  await page.goto(`${base}/`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    window.sameDocument = true;
  });
  // Rolling deployment: the route tree prefetch reaches the page's own
  // deployment, the segment data prefetch reaches the other deployment.
  route = (req) => (isSegmentDataPrefetch(req) ? other : own);
  await page.click("#prefetch");
  await page.waitForTimeout(2000);
  let rendered;
  if (finish === "lazy") {
    await page.click("#open");
    rendered = await page.textContent("#lazy");
  } else {
    route = () => own;
    await page.click("#link");
    rendered = await page.textContent("#widget");
  }
  const reloaded = await page.evaluate(() => window.sameDocument !== true);
  await page.close();
  return { foreignChunks, reloaded, rendered };
};

let failed = false;
try {
  await Promise.all(Object.values(PORTS).map(waitForServer));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const cases = [
    ["page from deployment A, then a lazy component on the same page", "a", "b", "lazy"],
    ["page from deployment B, then a navigation answered by deployment B", "b", "a", "nav"],
  ];
  for (const [title, own, other, finish] of cases) {
    const result = await scenario(browser, own, other, finish);
    const expected = `lazy-module-from:${own.toUpperCase()}`;
    const ok = result.foreignChunks.length === 0 && result.rendered.includes(expected);
    failed ||= !ok;
    console.log(`\n${ok ? "PASS" : "FAIL"}: ${title}`);
    console.log(`  chunks loaded from the other deployment: ${JSON.stringify(result.foreignChunks)}`);
    console.log(`  rendered: "${result.rendered}" (expected to contain "${expected}")`);
    console.log(`  page reloaded: ${result.reloaded}`);
  }
  await browser.close();
} finally {
  front.close();
  for (const server of servers) server.kill();
}
process.exit(failed ? 1 : 0);

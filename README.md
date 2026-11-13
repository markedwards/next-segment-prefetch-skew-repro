# Version skew: a segment prefetch loads another deployment's client chunks

With `deploymentId` set, an App Router page can load and run client modules
from another deployment during a rolling deployment. The client detects the
mismatch and discards the prefetched data, but only after the Flight decoder
has loaded the chunks that the response references.

## Run

```bash
pnpm install
npx playwright install chromium
pnpm repro
```

`run.mjs` builds the app twice (`deploymentId` `A` and `B`). The two builds
differ only in the directory of one imported module (`vendor-a/dep.js` or
`vendor-b/dep.js`), like a dependency whose install path changed. It starts
both with `next start` behind one front proxy that stands in for a load
balancer, and serves `/_next/static` from both builds, like a CDN that keeps
old assets.

## Scenarios

In both, the page prefetches `/b`. The route tree prefetch
(`next-router-segment-prefetch: /_tree`) reaches the page's own deployment.
The segment data prefetch reaches the other deployment.

1. Page from `A`. After the prefetch, the page opens a `React.lazy` component.
2. Page from `B`. After the prefetch, the page navigates to `/b`, and `B`
   answers the navigation.

## Result

```
FAIL: page from deployment A, then a lazy component on the same page
  chunks loaded from the other deployment: ["2bm_48hmrquvz.js","1rm806ue8tbut.js"]
  rendered: "lazy-module-from:B" (expected to contain "lazy-module-from:A")
  page reloaded: false

FAIL: page from deployment B, then a navigation answered by deployment B
  chunks loaded from the other deployment: ["22-xnm7m3ui1e.js","2bm_48hmrquvz.js"]
  rendered: "widget lazy-module-from:A" (expected to contain "lazy-module-from:B")
  page reloaded: false
```

Tested on 16.4.2, 16.4.6 and 16.5.0-canary.49.

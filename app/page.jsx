import Link from "next/link";
import LazyButton from "./LazyButton";
export default function Home() {
  return (
    <main>
      <h1>home</h1>
      <Link id="link" href="/b" prefetch={false}>to b</Link>
      <LazyButton />
    </main>
  );
}

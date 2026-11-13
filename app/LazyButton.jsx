"use client";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useState } from "react";
const Lazy = lazy(() => import("./Lazy"));
export default function LazyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button id="prefetch" onClick={() => router.prefetch("/b")}>prefetch /b</button>
      <button id="open" onClick={() => setOpen(true)}>open lazy</button>
      {open && (
        <Suspense fallback={<p>loading</p>}>
          <Lazy />
        </Suspense>
      )}
    </div>
  );
}

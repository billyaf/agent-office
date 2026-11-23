"use client";
import dynamic from "next/dynamic";

const Office = dynamic(() => import("../components/Office"), {
  ssr: false,
  loading: () => <main className="loading">Menyiapkan kantor…</main>,
});

export default function Page() {
  return <Office />;
}

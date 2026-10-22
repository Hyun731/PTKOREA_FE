"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AudienceView } from "@/components/editor/presenter";
import "@/components/editor/editor.css";

function Inner() {
  const { deckId } = useParams<{ deckId: string }>();
  const i = Number(useSearchParams().get("i") ?? 0) || 0;
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  return host ? createPortal(<AudienceView deckId={deckId} initial={i} />, host) : null;
}

export default function AudiencePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

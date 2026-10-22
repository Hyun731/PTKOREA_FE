"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DeckEditor } from "@/components/editor/editor";
import "@/components/editor/editor.css";

export default function EditorPage() {
  const { deckId } = useParams<{ deckId: string }>();
  // Full-screen tool: render on <body>, outside the site shell's layout box.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  return host ? createPortal(<DeckEditor deckId={deckId} />, host) : null;
}

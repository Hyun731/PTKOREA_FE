import type { Metadata } from "next";
import Link from "next/link";
import { ShellProvider } from "@/components/shell";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = { title: "리서치 팩트북", description: "브랜드 마케팅 리서치 PPT 워크스페이스" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a href="#main" className="skip-link">
          본문으로 건너뛰기
        </a>
        <header className="topbar">
          <Link href="/" className="brand">
            리서치 팩트북
          </Link>
          <span className="spacer" />
          <Link href="/" className="tag">
            프로젝트 목록
          </Link>
        </header>
        <ToastProvider>
          <main id="main" tabIndex={-1}>
            <ShellProvider>{children}</ShellProvider>
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}

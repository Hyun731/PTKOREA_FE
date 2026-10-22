"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const SidebarContext = createContext<(node: ReactNode) => void>(() => {});

// Persistent app shell (sidebar + main) mounted once at the root layout so every
// page — including the project list — has a sidebar from first load. Nested
// pages push their own sidebar content up through this context instead of each
// rendering their own shell grid.
export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebar, setSidebar] = useState<ReactNode>(null);
  return (
    <SidebarContext.Provider value={setSidebar}>
      <div className="shell">
        <aside className="sidebar" aria-label="탐색">
          {sidebar}
        </aside>
        <div className="main">
          <div className="main-inner">{children}</div>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebarContent(node: ReactNode) {
  const setSidebar = useContext(SidebarContext);
  useEffect(() => {
    setSidebar(node);
  });
  useEffect(() => () => setSidebar(null), [setSidebar]);
}

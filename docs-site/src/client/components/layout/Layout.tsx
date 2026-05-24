import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SidebarProvider } from './SidebarContext.js';
import { TopBar } from './TopBar.js';
import { Sidebar } from './Sidebar.js';
import { MainContent } from './MainContent.js';

// ---------------------------------------------------------------------------
// Layout — Gemini CLI style: announcement banner + TopBar + Sidebar + Content
// ---------------------------------------------------------------------------

export function Layout({ children }: { children?: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen bg-bg-primary">
        <AnnouncementBanner />
        <TopBar />
        <div className="flex h-screen" style={{ paddingTop: 'calc(var(--size-banner-height) + var(--size-topbar-height))' }}>
          <Sidebar />
          <MainContent>{children}</MainContent>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AnnouncementBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[101] bg-[#2E7D32] text-white text-[length:14px] text-center py-[8px] px-[var(--spacing-4)] leading-[1.4]">
      Maestro v0.4.18 已发布 — 统一知识检索 (codebase/session 虚拟节点) + maestro-next 单链推荐命令。详见{' '}
      <Link
        to="/changelog"
        className="text-white font-[var(--font-weight-semibold)] underline hover:no-underline"
      >
        更新日志
      </Link>
    </div>
  );
}

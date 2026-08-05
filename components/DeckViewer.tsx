'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeckViewer({
  id,
  title,
  folderId,
}: {
  id: string;
  title: string;
  folderId: string | null;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const backHref = folderId ? `/?folderId=${folderId}` : '/';
  const [barVisible, setBarVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusDeck = () => ref.current?.focus();

  const scheduleHide = () => {
    setBarVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBarVisible(false), 2000);
  };

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const goFullscreen = () => ref.current?.requestFullscreen?.();
  const noFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="fixed inset-0 bg-black" onMouseMove={scheduleHide} onClick={focusDeck}>
      <iframe
        ref={ref}
        src={`/api/decks/${id}/raw`}
        sandbox="allow-scripts"
        allow="fullscreen"
        onLoad={focusDeck}
        className="h-full w-full border-0"
      />
      <div
        className={`fixed inset-x-0 top-0 flex h-12 items-center gap-4 bg-black/70 px-4 text-white transition-opacity ${
          barVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button onMouseDown={noFocusSteal} onClick={() => router.push(backHref)} className="hover:underline">← 뒤로</button>
        <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        <a onMouseDown={noFocusSteal} href={`/api/decks/${id}/download`} className="hover:underline">다운로드</a>
        <button onMouseDown={noFocusSteal} onClick={goFullscreen} className="hover:underline">전체화면</button>
      </div>
    </div>
  );
}

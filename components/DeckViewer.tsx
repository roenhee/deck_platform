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
  const [barVisible, setBarVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backHref = folderId ? `/?folderId=${folderId}` : '/';

  const focusDeck = () => ref.current?.focus();

  // 바를 띄우고 2초 뒤 자동 숨김 타이머를 재무장한다.
  const revealBar = () => {
    setBarVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBarVisible(false), 2000);
  };

  useEffect(() => {
    revealBar();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const goFullscreen = () => ref.current?.requestFullscreen?.();
  const noFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="fixed inset-0 bg-black" onMouseMove={revealBar} onClick={focusDeck}>
      <iframe
        ref={ref}
        src={`/api/decks/${id}/raw`}
        sandbox="allow-scripts"
        allow="fullscreen"
        onLoad={focusDeck}
        className="h-full w-full border-0"
      />

      {/*
        상단 hover 트리거존. sandbox iframe은 마우스 이동 이벤트를 부모로 넘기지 않아서,
        바가 숨겨진 뒤엔 부모가 mousemove를 받을 방법이 없다(화면 전체가 iframe).
        화면 맨 위(바가 뜰 자리와 동일한 48px)로 마우스를 가져가면 이 영역이 감지해
        바를 다시 띄운다. 바가 보이는 동안엔 렌더하지 않아 덱 조작을 방해하지 않는다.
      */}
      {!barVisible && (
        <div
          className="fixed inset-x-0 top-0 z-40 h-12"
          onMouseEnter={revealBar}
          onMouseMove={revealBar}
        />
      )}

      <div
        onMouseMove={revealBar}
        className={`fixed inset-x-0 top-0 z-50 flex h-12 items-center gap-4 bg-black/70 px-4 text-white transition-opacity ${
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

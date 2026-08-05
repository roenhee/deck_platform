'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadButton({ folderId }: { folderId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.html')) {
      alert('.html 파일만 업로드할 수 있습니다.');
      return;
    }
    setBusy(true);
    try {
      // 1) signed upload URL 발급
      const urlRes = await fetch('/api/decks/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      });
      if (!urlRes.ok) {
        alert('업로드 URL 발급 실패: ' + (await urlRes.json()).error);
        return;
      }
      const { deckId, path, uploadUrl } = await urlRes.json();

      // 2) Storage로 직접 PUT
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'text/html' },
        body: file,
      });
      if (!putRes.ok) {
        alert('파일 업로드 실패 (' + putRes.status + ')');
        return;
      }

      // 3) 메타데이터 등록
      const title = file.name.replace(/\.html$/i, '');
      const metaRes = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          folderId,
          deckId,
          storagePath: path,
          originalFilename: file.name,
          fileSize: file.size,
        }),
      });
      if (!metaRes.ok) {
        alert('메타데이터 등록 실패');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".html,text/html" onChange={onFile} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? '업로드 중…' : '＋ 업로드'}
      </button>
    </>
  );
}

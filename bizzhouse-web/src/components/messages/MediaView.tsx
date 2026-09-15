'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, ImageIcon } from 'lucide-react';

const API_ROOT = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(
  /\/api\/?$/,
  '',
);

/**
 * Renders stored media. Internal URLs (/api/media/...) require the
 * caller's JWT, so the bytes are fetched through the authenticated
 * client and served as a blob — external URLs render as plain links.
 */
export function MediaView({
  url,
  mediaType,
  filename,
}: {
  url: string;
  mediaType: string;
  filename?: string;
}) {
  const internal = url.startsWith('/');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!internal) return;
    let revoked: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const token = localStorage.getItem('bizzhouse_token');
        const res = await axios.get(`${API_ROOT}${url}`, {
          responseType: 'blob',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const objectUrl = URL.createObjectURL(res.data as Blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        revoked = objectUrl;
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [internal, url]);

  if (!internal) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] underline underline-offset-2 break-all"
      >
        {filename || 'View media'}
      </a>
    );
  }

  if (failed) {
    return <span className="text-[11px] opacity-70">Media unavailable</span>;
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center gap-2 text-[11px] opacity-60">
        <ImageIcon className="w-4 h-4" />
        <span>Loading…</span>
      </div>
    );
  }

  if (mediaType === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={blobUrl} alt={filename || 'Shared media'} className="rounded-lg max-w-[220px]" />;
  }

  return (
    <a
      href={blobUrl}
      download={filename || true}
      className="text-[11px] font-medium underline underline-offset-2 flex items-center gap-1.5"
    >
      <Download className="w-3.5 h-3.5" />
      {filename || 'Download media'}
    </a>
  );
}

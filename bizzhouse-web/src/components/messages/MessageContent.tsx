'use client';

import { FileText, ImageIcon, MapPin, Music, Sticker, Video } from 'lucide-react';
import type { NormalizedMessageContent } from '@/lib/normalize';
import { MediaView } from './MediaView';

/**
 * Renders normalized message content. Raw provider payloads never reach
 * this component — callers pass the result of normalizeMessageContent().
 */
export function MessageContent({ content }: { content: NormalizedMessageContent }) {
  switch (content.kind) {
    case 'text':
      return <p className="whitespace-pre-wrap break-words">{content.text}</p>;

    case 'template':
      return (
        <div className="space-y-1.5">
          {content.templateName && (
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {content.templateName}
            </div>
          )}
          <p className="whitespace-pre-wrap break-words">
            {content.body.includes('{{') && content.variables?.length
              ? fillValues(content.body, content.variables)
              : content.body}
          </p>
        </div>
      );

    case 'media':
      return (
        <div className="space-y-1.5 min-w-[140px]">
          <div className="flex items-center gap-2 opacity-80">
            <MediaIcon mediaType={content.mediaType} />
            <span className="text-[11px] font-medium capitalize">{content.mediaType}</span>
          </div>
          {content.url ? (
            <MediaView url={content.url} mediaType={content.mediaType} filename={content.filename} />
          ) : (
            <span className="text-[11px] opacity-70">Media (link expired or unavailable)</span>
          )}
          {content.caption && <p className="whitespace-pre-wrap break-words">{content.caption}</p>}
        </div>
      );

    case 'location':
      return (
        <div className="flex items-start gap-2 min-w-[140px]">
          <MapPin className="w-4 h-4 shrink-0 opacity-80" />
          <div>
            <div className="text-[12px] font-medium">Location</div>
            {content.address && (
              <div className="text-[11px] opacity-80">{content.address}</div>
            )}
            {content.latitude != null && content.longitude != null && (
              <a
                href={`https://maps.google.com/?q=${content.latitude},${content.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] underline underline-offset-2"
              >
                {content.latitude.toFixed(5)}, {content.longitude.toFixed(5)}
              </a>
            )}
          </div>
        </div>
      );

    case 'unsupported':
    default:
      return (
        <p className="italic opacity-70">[{content.label || 'Unsupported message'}]</p>
      );
  }
}

function MediaIcon({ mediaType }: { mediaType: string }) {
  switch (mediaType) {
    case 'image':
      return <ImageIcon className="w-4 h-4" />;
    case 'video':
      return <Video className="w-4 h-4" />;
    case 'audio':
      return <Music className="w-4 h-4" />;
    case 'document':
      return <FileText className="w-4 h-4" />;
    case 'sticker':
      return <Sticker className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
}

/** Local helper mirroring backend fillTemplateBody for live preview fills. */
function fillValues(body: string, values: string[]): string {
  let i = 0;
  return body.replace(/\{\{\d+\}\}/g, () => values[i++] ?? '');
}

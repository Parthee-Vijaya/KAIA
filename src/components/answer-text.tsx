import type { ReactNode } from 'react';
import type { SourceRef } from '@/domain/types';
import { displayText } from './display-text';

/** A small, escaped text renderer: emphasis and known citations, with no HTML or arbitrary links. */
export function AnswerText({
  text,
  sources = [],
  onSource,
}: {
  text: string;
  sources?: SourceRef[];
  onSource?: (source: SourceRef) => void;
}) {
  function render(value: string, prefix = ''): ReactNode[] {
    return value.split(/(\[\d+\]|\*\*[^*\n]+\*\*)/g).map((part, index) => {
      const key = `${prefix}${index}`;
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={key}>{render(part.slice(2, -2), `${key}-`)}</strong>;
      const citation = /^\[(\d+)\]$/.exec(part);
      const number = citation ? Number(citation[1]) : 0;
      const source = number > 0 ? sources[number - 1] : undefined;
      return source && onSource ? (
        <button
          key={key}
          type="button"
          className="inline-citation"
          aria-label={`Åbn kilde ${number}`}
          onClick={() => onSource(source)}
        >
          {number}
        </button>
      ) : (
        part
      );
    });
  }
  return <>{render(displayText(text).replace(/^#{1,6}\s+(.+)$/gm, '**$1**'))}</>;
}

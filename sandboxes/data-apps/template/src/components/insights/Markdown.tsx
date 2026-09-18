/**
 * Renders the small Markdown subset an investigation explanation uses:
 * headings, paragraphs, bullet and numbered lists, bold, italics and inline
 * code. Anything else is shown as plain text. Never renders HTML.
 */
import type { ReactNode } from 'react';

const inline = (text: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0;
    let key = 0;
    for (const match of text.matchAll(pattern)) {
        const start = match.index ?? 0;
        if (start > last) parts.push(text.slice(last, start));
        const token = match[0];
        if (token.startsWith('**')) {
            parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
        } else if (token.startsWith('`')) {
            parts.push(
                <code key={key++} className="rounded bg-muted px-1 font-mono text-xs">
                    {token.slice(1, -1)}
                </code>,
            );
        } else {
            parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
        }
        last = start + token.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
};

type Block =
    | { kind: 'heading'; text: string }
    | { kind: 'paragraph'; text: string }
    | { kind: 'bullets'; items: string[] }
    | { kind: 'numbered'; items: string[] };

const parse = (source: string): Block[] => {
    const blocks: Block[] = [];
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    let paragraph: string[] = [];
    const flush = () => {
        if (paragraph.length) {
            blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
            paragraph = [];
        }
    };
    for (const raw of lines) {
        const line = raw.trim();
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
        if (line === '') {
            flush();
        } else if (heading) {
            flush();
            blocks.push({ kind: 'heading', text: heading[1] });
        } else if (bullet) {
            flush();
            const prev = blocks[blocks.length - 1];
            if (prev?.kind === 'bullets') prev.items.push(bullet[1]);
            else blocks.push({ kind: 'bullets', items: [bullet[1]] });
        } else if (numbered) {
            flush();
            const prev = blocks[blocks.length - 1];
            if (prev?.kind === 'numbered') prev.items.push(numbered[1]);
            else blocks.push({ kind: 'numbered', items: [numbered[1]] });
        } else {
            paragraph.push(line);
        }
    }
    flush();
    return blocks;
};

export function Markdown({ text }: { text: string }) {
    return (
        <div className="space-y-2 leading-relaxed">
            {parse(text).map((block, index) => {
                switch (block.kind) {
                    case 'heading':
                        return (
                            <p key={index} className="pt-1 font-semibold">
                                {inline(block.text)}
                            </p>
                        );
                    case 'bullets':
                        return (
                            <ul key={index} className="list-disc space-y-1 pl-5">
                                {block.items.map((item, i) => (
                                    <li key={i}>{inline(item)}</li>
                                ))}
                            </ul>
                        );
                    case 'numbered':
                        return (
                            <ol key={index} className="list-decimal space-y-1 pl-5">
                                {block.items.map((item, i) => (
                                    <li key={i}>{inline(item)}</li>
                                ))}
                            </ol>
                        );
                    default:
                        return <p key={index}>{inline(block.text)}</p>;
                }
            })}
        </div>
    );
}

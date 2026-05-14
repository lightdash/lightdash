/**
 * Renders a user chat message, parsing bracketed element references
 * (`[h1 "FORMULA 1" @src/App.jsx:14]`) and showing them as inline pills
 * with the same styling as the input editor's mention pills. Anything
 * outside a reference renders as plain text, with newlines preserved.
 *
 * Used in the data-app chat history so post-submit messages match the
 * pre-submit input editor visually.
 */
import { Fragment, type FC } from 'react';
import classes from './AppPromptEditor.module.css';

// Capture: tag, optional "text", optional @loc.
// Loc allows any char except `]` (which terminates the reference) so paths
// with spaces (e.g. `My Component/App.tsx:42`) round-trip cleanly.
const REF_PATTERN =
    /\[([A-Za-z][A-Za-z0-9-]*)(?:\s+"([^"]*)")?(?:\s+@([^\]]+))?\]/g;

type Segment =
    | { kind: 'text'; value: string }
    | { kind: 'ref'; tag: string; text: string; loc: string };

function parse(content: string): Segment[] {
    const segments: Segment[] = [];
    let cursor = 0;
    REF_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null = REF_PATTERN.exec(content);
    while (match !== null) {
        if (match.index > cursor) {
            segments.push({
                kind: 'text',
                value: content.slice(cursor, match.index),
            });
        }
        segments.push({
            kind: 'ref',
            tag: match[1] ?? '',
            text: match[2] ?? '',
            loc: match[3] ?? '',
        });
        cursor = match.index + match[0].length;
        match = REF_PATTERN.exec(content);
    }
    if (cursor < content.length) {
        segments.push({ kind: 'text', value: content.slice(cursor) });
    }
    return segments;
}

const TextWithBreaks: FC<{ value: string }> = ({ value }) => {
    const lines = value.split('\n');
    return (
        <>
            {lines.map((line, i) => (
                <Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                </Fragment>
            ))}
        </>
    );
};

const ChatMessageContent: FC<{ content: string }> = ({ content }) => {
    const segments = parse(content);
    if (segments.length === 0) return null;
    return (
        <>
            {segments.map((seg, i) => {
                if (seg.kind === 'text') {
                    return <TextWithBreaks key={i} value={seg.value} />;
                }
                const inner = seg.text
                    ? `<${seg.tag}> ${seg.text}`
                    : `<${seg.tag}>`;
                return (
                    <span
                        key={i}
                        className={classes.elementPill}
                        title={seg.loc ? `Source: ${seg.loc}` : undefined}
                    >
                        {inner}
                    </span>
                );
            })}
        </>
    );
};

export default ChatMessageContent;

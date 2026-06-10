/**
 * Renders a user chat message, parsing bracketed element references
 * (`[h1 "FORMULA 1" @src/App.jsx:14]`) and showing them as inline pills
 * with the same styling as the input editor's mention pills. Anything
 * outside a reference renders as plain text, with newlines preserved.
 *
 * Markdown-style links (`[text](url)`) inside the plain-text segments
 * render as anchors — used by system-authored prompts (e.g. the v1 chat
 * bubble of a duplicated app, which links back to the source's preview)
 * without introducing a full markdown renderer.
 *
 * Used in the data-app chat history so post-submit messages match the
 * pre-submit input editor visually.
 */
import { Anchor } from '@mantine-8/core';
import { Fragment, type FC } from 'react';
import classes from './AppPromptEditor.module.css';

// Capture: tag, optional "text", optional @loc.
// Loc allows any char except `]` (which terminates the reference) so paths
// with spaces (e.g. `My Component/App.tsx:42`) round-trip cleanly.
const REF_PATTERN =
    /\[([A-Za-z][A-Za-z0-9-]*)(?:\s+"([^"]*)")?(?:\s+@([^\]]+))?\]/g;

// Markdown link: `[link text](href)`. Disallows newlines and `]`/`)`
// inside the parts so we don't run past the intended boundaries. Element
// refs never put `(` immediately after `]`, so the two patterns don't
// collide.
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

type Segment =
    | { kind: 'text'; value: string }
    | { kind: 'ref'; tag: string; text: string; loc: string }
    | { kind: 'link'; text: string; href: string };

function parseRefs(content: string): Segment[] {
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

function splitTextOnLinks(text: string): Segment[] {
    const segments: Segment[] = [];
    let cursor = 0;
    MARKDOWN_LINK.lastIndex = 0;
    let match: RegExpExecArray | null = MARKDOWN_LINK.exec(text);
    while (match !== null) {
        if (match.index > cursor) {
            segments.push({
                kind: 'text',
                value: text.slice(cursor, match.index),
            });
        }
        segments.push({
            kind: 'link',
            text: match[1] ?? '',
            href: match[2] ?? '',
        });
        cursor = match.index + match[0].length;
        match = MARKDOWN_LINK.exec(text);
    }
    if (cursor < text.length) {
        segments.push({ kind: 'text', value: text.slice(cursor) });
    }
    return segments;
}

function parse(content: string): Segment[] {
    return parseRefs(content).flatMap((seg) =>
        seg.kind === 'text' ? splitTextOnLinks(seg.value) : [seg],
    );
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
                if (seg.kind === 'link') {
                    return (
                        <Anchor
                            key={i}
                            href={seg.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            inherit
                        >
                            {seg.text}
                        </Anchor>
                    );
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

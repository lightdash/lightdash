import { ContentType } from '@lightdash/common';
import { type Editor } from '@tiptap/react';

// Must match `CONTENT_MENTION_NAME` in
// ee/features/aiCopilot/components/ChatElements/contentMentions.tsx — not
// exported from there, so kept in sync manually.
const CONTENT_MENTION_NODE_TYPE = 'contentMention';

// Escapes markdown syntax characters so plain typed text (e.g. "Q1 * Q2",
// "50% off!") isn't reinterpreted as emphasis/headings/etc when re-parsed by
// the read-view's markdown renderer.
const escapeMarkdown = (text: string) =>
    text.replace(/([\\`*_{}[\]()#+!])/g, '\\$1');

const mentionUrl = (
    projectUuid: string,
    contentType: ContentType,
    uuid: string,
): string =>
    contentType === ContentType.DASHBOARD
        ? `/projects/${projectUuid}/dashboards/${uuid}/view`
        : `/projects/${projectUuid}/saved/${uuid}/view`;

/** Serializes the composer's doc to markdown, turning @-mentioned content
 * into plain markdown links that `rehypeAiAgentContentLinks` renders as rich
 * chips on read. */
export const serializeAnnouncementMarkdown = (
    editor: Editor,
    projectUuid: string,
): string => {
    const paragraphs: string[] = [];
    editor.state.doc.forEach((paragraph) => {
        const parts: string[] = [];
        paragraph.forEach((child) => {
            if (child.type.name === 'image') {
                const attrs = child.attrs as { src?: string; alt?: string };
                if (attrs.src) {
                    parts.push(`![${attrs.alt ?? ''}](${attrs.src})`);
                }
                return;
            }
            if (child.type.name === CONTENT_MENTION_NODE_TYPE) {
                const attrs = child.attrs as {
                    contentType?: ContentType;
                    uuid?: string;
                    label?: string;
                };
                if (
                    attrs.uuid &&
                    (attrs.contentType === ContentType.CHART ||
                        attrs.contentType === ContentType.DASHBOARD)
                ) {
                    const label = escapeMarkdown(attrs.label ?? '');
                    const url = mentionUrl(
                        projectUuid,
                        attrs.contentType,
                        attrs.uuid,
                    );
                    parts.push(`[${label}](${url})`);
                }
                return;
            }
            if (child.isText) {
                let text = escapeMarkdown(child.text ?? '');
                child.marks.forEach((mark) => {
                    if (mark.type.name === 'bold') text = `**${text}**`;
                    else if (mark.type.name === 'italic') text = `_${text}_`;
                    else if (mark.type.name === 'code') text = `\`${text}\``;
                    else if (mark.type.name === 'strike') text = `~~${text}~~`;
                });
                parts.push(text);
            }
        });
        paragraphs.push(parts.join(''));
    });
    return paragraphs.join('\n\n').trim();
};

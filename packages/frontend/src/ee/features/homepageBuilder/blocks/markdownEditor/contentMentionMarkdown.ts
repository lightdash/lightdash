import { ContentType } from '@lightdash/common';
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { type Editor } from '@tiptap/react';
import { createContentMentionExtension } from '../../../aiCopilot/components/ChatElements/contentMentions';

// Matches `CONTENT_MENTION_NAME` in contentMentions.tsx (not exported there).
const CONTENT_MENTION_NODE_NAME = 'contentMention';

// Minimal structural view of tiptap-markdown's serializer state — we only
// write raw text into it.
type MarkdownSerializeState = { write: (text: string) => void };

const mentionHrefPattern =
    /^\/projects\/[^/]+\/(dashboards|saved)\/([^/]+)\/view$/;

const mentionUrl = (
    projectUuid: string,
    contentType: ContentType,
    uuid: string,
): string =>
    contentType === ContentType.DASHBOARD
        ? `/projects/${projectUuid}/dashboards/${uuid}/view`
        : `/projects/${projectUuid}/saved/${uuid}/view`;

// Escape characters that would otherwise break the `[label](url)` link syntax
// (chart/dashboard names can contain brackets, e.g. "[TC Test] Revenue").
const escapeLinkLabel = (label: string): string =>
    label.replace(/[[\]\\]/g, '\\$&');

/**
 * The shared content-mention node extended with tiptap-markdown serialization,
 * so `@`-mentions round-trip to markdown links. On the read side those links
 * are hydrated back into chips via `hydrateContentMentions`.
 */
export const createMentionMarkdownExtension = (projectUuid: string) =>
    createContentMentionExtension({
        getProjectUuid: () => projectUuid,
        getPriorityItems: () => [],
        includeFilesAndRepositories: false,
    }).extend({
        addStorage() {
            return {
                markdown: {
                    serialize(
                        state: MarkdownSerializeState,
                        node: ProseMirrorNode,
                    ) {
                        const contentType = node.attrs
                            .contentType as ContentType | null;
                        const uuid = node.attrs.uuid as string | null;
                        const label = node.attrs.label as string | null;
                        if (
                            uuid &&
                            (contentType === ContentType.CHART ||
                                contentType === ContentType.DASHBOARD)
                        ) {
                            state.write(
                                `[${escapeLinkLabel(label ?? '')}](${mentionUrl(
                                    projectUuid,
                                    contentType,
                                    uuid,
                                )})`,
                            );
                        }
                    },
                    parse: {},
                },
            };
        },
    });

/**
 * Replaces link marks that point at a chart/dashboard with `contentMention`
 * chip nodes, so parsed markdown renders mentions identically to the composer.
 */
export const hydrateContentMentions = (editor: Editor): void => {
    const mentionType = editor.schema.nodes[CONTENT_MENTION_NODE_NAME];
    if (!mentionType) return;

    const jobs: { from: number; to: number; attrs: Record<string, unknown> }[] =
        [];
    editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        const linkMark = node.marks.find((mark) => mark.type.name === 'link');
        const href = linkMark?.attrs.href;
        if (typeof href !== 'string') return;
        const match = href.match(mentionHrefPattern);
        if (!match) return;
        jobs.push({
            from: pos,
            to: pos + node.nodeSize,
            attrs: {
                contentType:
                    match[1] === 'dashboards'
                        ? ContentType.DASHBOARD
                        : ContentType.CHART,
                uuid: match[2],
                label: node.text,
            },
        });
    });
    if (jobs.length === 0) return;

    let { tr } = editor.state;
    // Apply right-to-left so earlier positions stay valid.
    jobs.reverse().forEach(({ from, to, attrs }) => {
        tr = tr.replaceWith(from, to, mentionType.create(attrs));
    });
    editor.view.dispatch(tr);
};

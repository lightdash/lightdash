import { ContentType } from '@lightdash/common';
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { createContentMentionExtension } from '../../../aiCopilot/components/ChatElements/contentMentions';

// Minimal structural view of tiptap-markdown's serializer state — we only
// write raw text into it.
type MarkdownSerializeState = { write: (text: string) => void };

const mentionUrl = (
    projectUuid: string,
    contentType: ContentType,
    uuid: string,
): string =>
    contentType === ContentType.DASHBOARD
        ? `/projects/${projectUuid}/dashboards/${uuid}/view`
        : `/projects/${projectUuid}/saved/${uuid}/view`;

/**
 * The shared content-mention node extended with tiptap-markdown serialization,
 * so `@`-mentions round-trip to plain markdown links that the read-side
 * (`rehypeAiAgentContentLinks`) renders back as chips.
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
                                `[${label ?? ''}](${mentionUrl(
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

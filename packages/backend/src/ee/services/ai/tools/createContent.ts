import { createContentToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    createContent: CreateContentFn;
};

const toolDefinition = createContentToolDefinition.for('agent');

const contentResult = ({
    content,
    href,
    type,
}: {
    content: unknown;
    href: string;
    type: 'dashboard' | 'chart';
}) => `<${type} href="${href}" />\n---\n${JSON.stringify(content, null, 2)}`;

export const getCreateContent = ({ createContent }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ type, content }) => {
            try {
                const result = await createContent({
                    type,
                    content,
                } as Parameters<CreateContentFn>[0]);
                const metadata = {
                    status: 'success' as const,
                    slug: result.content.slug,
                    name: result.content.name,
                    uuid: result.uuid,
                    href: result.href,
                };

                return {
                    result: contentResult({
                        content: result.content,
                        href: metadata.href,
                        type: result.type,
                    }),
                    metadata,
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error creating ${type} "${content.slug}". Content was not created.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

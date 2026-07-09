import { readContentToolDefinition } from '@lightdash/common';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    readContent: ReadContentFn;
};

const toolDefinition = readContentToolDefinition.for('ai-sdk');

const contentResult = ({
    content,
    href,
    type,
}: {
    content: unknown;
    href: string;
    type: 'dashboard' | 'chart';
}) => `<${type} href="${href}" />\n---\n${JSON.stringify(content, null, 2)}`;

export const getReadContent = ({ readContent }: Dependencies) =>
    toolDefinition.build({
        execute: async ({ slug, type }) => {
            try {
                const result = await readContent({ slug, type });
                const metadata = {
                    status: 'success' as const,
                    slug: result.content.slug,
                    name: result.content.name,
                    href: result.href,
                };

                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: contentResult({
                        content: result.content,
                        href: metadata.href,
                        type: result.type,
                    }),
                    metadata,
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        `Error reading ${type} "${slug}"`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });

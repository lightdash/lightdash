import { readContentToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    readContent: ReadContentFn;
};

const toolDefinition = readContentToolDefinition.for('agent');

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
    tool({
        ...toolDefinition,
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
                        `Error reading ${type} "${slug}"`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

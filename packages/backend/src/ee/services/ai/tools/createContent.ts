import { createContentToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getChartContentWarnings } from '../utils/contentWarnings';
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
    warnings,
}: {
    content: unknown;
    href: string;
    type: 'dashboard' | 'chart';
    warnings: string[];
}) => {
    const warningText =
        warnings.length > 0 ? `\n---\n${warnings.join('\n')}` : '';
    return `<${type} href="${href}" />\n---\n${JSON.stringify(
        content,
        null,
        2,
    )}${warningText}`;
};

export const getCreateContent = ({ createContent }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ type, content }) => {
            try {
                const result = await createContent({
                    type,
                    content,
                } as Parameters<CreateContentFn>[0]);
                const warnings =
                    result.type === 'chart'
                        ? getChartContentWarnings(result.content)
                        : [];
                const metadata = {
                    status: 'success' as const,
                    slug: result.content.slug,
                    name: result.content.name,
                    uuid: result.uuid,
                    href: result.href,
                    warnings,
                };

                return {
                    result: contentResult({
                        content: result.content,
                        href: metadata.href,
                        type: result.type,
                        warnings,
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

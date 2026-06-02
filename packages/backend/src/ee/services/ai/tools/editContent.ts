import { editContentToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { getChartContentWarnings } from '../utils/contentWarnings';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editContent: EditContentFn;
};

const toolDefinition = editContentToolDefinition.for('agent');

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

export const getEditContent = ({ editContent }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ slug, type, patch }) => {
            try {
                const result = await editContent({ slug, type, patch });
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
                    versionUuids: result.versionUuids,
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
                        `Error editing ${type} "${slug}". Patch was not applied.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

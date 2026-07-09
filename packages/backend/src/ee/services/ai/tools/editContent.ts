import {
    editContentToolDefinition,
    type ContentToolSuccessMetadata,
} from '@lightdash/common';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { getContentWarnings } from '../utils/contentWarnings';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editContent: EditContentFn;
};

const toolDefinition = editContentToolDefinition.for('ai-sdk');

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
    toolDefinition.build({
        execute: async ({ slug, type, patch }) => {
            try {
                const result = await editContent({ slug, type, patch });
                const warnings = getContentWarnings(result);
                const metadata = {
                    status: 'success' as const,
                    slug: result.content.slug,
                    name: result.content.name,
                    uuid: result.uuid,
                    href: result.href,
                    versionUuids: result.versionUuids,
                    warnings,
                } satisfies ContentToolSuccessMetadata;

                return {
                    status: 'success' as const,
                    type: 'string' as const,
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
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        `Error editing ${type} "${slug}". Patch was not applied.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });

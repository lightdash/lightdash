import {
    createContentToolDefinition,
    type ContentToolSuccessMetadata,
} from '@lightdash/common';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getContentWarnings } from '../utils/contentWarnings';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    createContent: CreateContentFn;
};

const toolDefinition = createContentToolDefinition.for('ai-sdk');

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
    toolDefinition.build({
        execute: async ({ type, content }) => {
            try {
                const result = await createContent({
                    type,
                    content,
                } as Parameters<CreateContentFn>[0]);
                const warnings = getContentWarnings(result);
                const metadata = {
                    status: 'success' as const,
                    slug: result.content.slug,
                    name: result.content.name,
                    uuid: result.uuid,
                    href: result.href,
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
                        `Error creating ${type} "${content.slug}". Content was not created.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });

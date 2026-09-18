import {
    createContentToolDefinition,
    mcpCreateContentArgsSchema,
    mcpCreateContentToolDefinition,
    toolCreateContentArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getContentWarnings } from '../utils/contentWarnings';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    createContent: CreateContentFn;
    documentsEnabled?: boolean;
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
    type: 'dashboard' | 'chart' | 'document';
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

export const getCreateContent = ({
    createContent,
    documentsEnabled = false,
}: Dependencies) =>
    tool({
        ...(documentsEnabled
            ? mcpCreateContentToolDefinition.for('agent')
            : toolDefinition),
        execute: async (args) => {
            const { type, content } = args;
            try {
                (documentsEnabled
                    ? mcpCreateContentArgsSchema
                    : toolCreateContentArgsSchema
                ).parse(args);
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
                    ...(result.type === 'document'
                        ? { versionUuid: result.versionUuid }
                        : {}),
                };

                return {
                    result: contentResult({
                        content:
                            result.type === 'document'
                                ? result
                                : result.content,
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

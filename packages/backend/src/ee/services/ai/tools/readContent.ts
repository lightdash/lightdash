import {
    mcpReadContentArgsSchema,
    mcpReadContentToolDefinition,
    ParameterError,
    readContentToolDefinition,
    toolReadContentArgsSchema,
    type ReadContentType,
} from '@lightdash/common';
import { tool, type FlexibleSchema } from 'ai';
import { z } from 'zod';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    readContent: ReadContentFn;
    documentsEnabled?: boolean;
};

const toolDefinition = readContentToolDefinition.for('agent');

const contentResult = ({
    content,
    href,
    type,
}: {
    content: unknown;
    href: string;
    type: ReadContentType | 'document';
}) => `<${type} href="${href}" />\n---\n${JSON.stringify(content, null, 2)}`;

export const getReadContent = ({
    readContent,
    documentsEnabled = false,
}: Dependencies) => {
    const definition = documentsEnabled
        ? mcpReadContentToolDefinition.for('agent')
        : toolDefinition;
    const inputSchema: FlexibleSchema<
        z.infer<typeof mcpReadContentArgsSchema>
    > = definition.inputSchema;
    return tool({
        ...definition,
        inputSchema,
        execute: async (args) => {
            const { slug, type, documentUuid } = args;
            try {
                (documentsEnabled
                    ? mcpReadContentArgsSchema
                    : toolReadContentArgsSchema
                ).parse(args);
                const getReadArgs = (): Parameters<ReadContentFn>[0] => {
                    if (type === 'document' && documentUuid !== undefined) {
                        if (slug !== undefined) {
                            throw new ParameterError(
                                'Documents require exactly one of slug or documentUuid.',
                            );
                        }
                        return { type, documentUuid };
                    }
                    if (slug === undefined || documentUuid !== undefined) {
                        throw new ParameterError(
                            'Reading content requires a slug, or documentUuid for Documents.',
                        );
                    }
                    return { slug, type };
                };
                const result = await readContent(getReadArgs());
                const metadata = {
                    status: 'success' as const,
                    slug: result.content.slug,
                    name: result.content.name,
                    href: result.href,
                    ...(result.type === 'document'
                        ? { uuid: result.uuid, versionUuid: result.versionUuid }
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
};

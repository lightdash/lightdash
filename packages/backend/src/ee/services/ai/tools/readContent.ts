import {
    assertUnreachable,
    mcpReadContentArgsSchema,
    mcpReadContentToolDefinition,
    ParameterError,
    readContentToolDefinition,
    toolReadContentArgsSchema,
    type ToolReadContentStructuredContent,
} from '@lightdash/common';
import { tool, type FlexibleSchema } from 'ai';
import { z } from 'zod';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    readContent: ReadContentFn;
    documentsEnabled?: boolean;
};

const toolDefinition = readContentToolDefinition.for('agent');

type ReadContentResult = Awaited<ReturnType<ReadContentFn>>;

const contentResult = ({
    content,
    href,
    type,
}: {
    content: unknown;
    href: string;
    type: ReadContentResult['type'];
}) => `<${type} href="${href}" />\n---\n${JSON.stringify(content, null, 2)}`;

const toStructuredContent = (
    read: ReadContentResult,
): ToolReadContentStructuredContent => {
    const base = {
        slug: read.content.slug,
        name: read.content.name,
        href: read.href,
    };
    switch (read.type) {
        case 'dashboard':
        case 'chart':
        case 'data_app':
            return { ...base, type: read.type, content: read.content };
        case 'document':
            return {
                ...base,
                type: read.type,
                uuid: read.uuid,
                versionUuid: read.versionUuid,
                content: read.content,
            };
        default:
            return assertUnreachable(read, 'Unknown read content type');
    }
};

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
                const read = await readContent(getReadArgs());
                const structuredContent = toStructuredContent(read);
                const metadata = {
                    status: 'success' as const,
                    slug: structuredContent.slug,
                    name: structuredContent.name,
                    href: structuredContent.href,
                    ...(structuredContent.type === 'document'
                        ? {
                              uuid: structuredContent.uuid,
                              versionUuid: structuredContent.versionUuid,
                          }
                        : {}),
                };

                return {
                    result: contentResult({
                        content: read.type === 'document' ? read : read.content,
                        href: structuredContent.href,
                        type: structuredContent.type,
                    }),
                    metadata,
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error reading ${type} "${slug}"`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};

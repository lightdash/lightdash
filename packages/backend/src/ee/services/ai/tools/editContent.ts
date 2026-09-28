import {
    editContentToolDefinition,
    mcpEditContentArgsSchema,
    mcpEditContentToolDefinition,
    ParameterError,
    toolEditContentArgsSchema,
    type ToolEditContentStructuredContent,
} from '@lightdash/common';
import { tool, type FlexibleSchema } from 'ai';
import { z } from 'zod';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { getContentWarnings } from '../utils/contentWarnings';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    editContent: EditContentFn;
    documentsEnabled?: boolean;
};

type EditedContent = Awaited<ReturnType<EditContentFn>>;

const toolDefinition = editContentToolDefinition.for('agent');

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

const toStructuredContent = (
    result: EditedContent,
    warnings: string[],
): ToolEditContentStructuredContent =>
    result.type === 'document'
        ? {
              type: result.type,
              href: result.href,
              uuid: result.uuid,
              versionUuid: result.versionUuid,
              content: result.content,
              warnings,
          }
        : {
              type: result.type,
              href: result.href,
              content: result.content,
              warnings,
          };

export const getEditContent = ({
    editContent,
    documentsEnabled = false,
}: Dependencies) => {
    const definition = documentsEnabled
        ? mcpEditContentToolDefinition.for('agent')
        : toolDefinition;
    const inputSchema: FlexibleSchema<
        z.infer<typeof mcpEditContentArgsSchema>
    > = definition.inputSchema;
    return tool({
        ...definition,
        inputSchema,
        execute: async (args) => {
            const { slug, type, patch, documentEdit } = args;
            try {
                (documentsEnabled
                    ? mcpEditContentArgsSchema
                    : toolEditContentArgsSchema
                ).parse(args);
                const getEditArgs = (): Parameters<EditContentFn>[0] => {
                    if (type === 'document') {
                        if (patch !== undefined || documentEdit === undefined) {
                            throw new ParameterError(
                                'Documents require documentEdit instead of patch.',
                            );
                        }
                        return { slug, type, documentEdit };
                    }
                    if (documentEdit !== undefined || patch === undefined) {
                        throw new ParameterError(
                            'Charts and dashboards require patch instead of documentEdit.',
                        );
                    }
                    return { slug, type, patch };
                };
                const result = await editContent(getEditArgs());
                const warnings = getContentWarnings(result);
                const metadata = {
                    status: 'success' as const,
                    slug: result.content.slug,
                    name: result.content.name,
                    uuid: result.uuid,
                    href: result.href,
                    versionUuids:
                        result.type === 'document'
                            ? {
                                  before:
                                      documentEdit?.type === 'content'
                                          ? documentEdit.baseVersionUuid
                                          : null,
                                  after: result.versionUuid,
                              }
                            : result.versionUuids,
                    warnings,
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
                    structuredContent: toStructuredContent(result, warnings),
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error editing ${type} "${slug}". Changes were not applied.`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};

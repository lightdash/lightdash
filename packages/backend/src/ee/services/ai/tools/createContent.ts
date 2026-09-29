import {
    createContentToolDefinition,
    mcpCreateContentArgsSchema,
    mcpCreateContentToolDefinition,
    toolCreateContentArgsSchema,
    type ToolCreateContentOutput,
    type ToolCreateContentStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getContentWarnings } from '../utils/contentWarnings';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    createContent: CreateContentFn;
    documentsEnabled?: boolean;
};

type CreatedContent = Awaited<ReturnType<CreateContentFn>>;

type ExecuteCreateContentResult =
    | ExecuteStructuredToolResult<
          ToolCreateContentStructuredContent,
          Extract<ToolCreateContentOutput['metadata'], { status: 'success' }>
      >
    | ExecuteToolErrorResult;

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

const toCreatedContent = (
    result: CreatedContent,
    warnings: string[],
): ToolCreateContentStructuredContent => {
    const created = {
        href: result.href,
        uuid: result.uuid,
        slug: result.content.slug,
        name: result.content.name,
        content: result.content,
        warnings,
    };
    return result.type === 'document'
        ? { type: 'document', versionUuid: result.versionUuid, ...created }
        : { type: result.type, ...created };
};

export const getCreateContent = ({
    createContent,
    documentsEnabled = false,
}: Dependencies) =>
    tool({
        ...(documentsEnabled
            ? mcpCreateContentToolDefinition.for('agent')
            : toolDefinition),
        execute: async (args): Promise<ExecuteCreateContentResult> => {
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
                const created = toCreatedContent(
                    result,
                    getContentWarnings(result),
                );
                const metadata = {
                    status: 'success' as const,
                    slug: created.slug,
                    name: created.name,
                    uuid: created.uuid,
                    href: created.href,
                    warnings: created.warnings,
                    ...(created.type === 'document'
                        ? { versionUuid: created.versionUuid }
                        : {}),
                };

                return {
                    result: contentResult({
                        content:
                            result.type === 'document'
                                ? result
                                : created.content,
                        href: created.href,
                        type: created.type,
                        warnings: created.warnings,
                    }),
                    metadata,
                    structuredContent: created,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error creating ${type} "${content.slug}". Content was not created.`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

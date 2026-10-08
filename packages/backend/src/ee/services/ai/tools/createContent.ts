import {
    createContentToolDefinition,
    documentAsCodeSchema,
    mcpCreateContentArgsSchema,
    mcpCreateContentToolDefinition,
    toolCreateContentArgsSchema,
    toolSqlChartAsCodeSchema,
    type SqlChartAsCode,
    type ToolCreateContentOutput,
    type ToolCreateContentStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import type { ArtifactChartExportAccess } from '../utils/artifactChartAsCode';
import { getContentWarnings } from '../utils/contentWarnings';
import { resolveDocumentConversationTags } from '../utils/documentConversationTags';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { SqlNotApprovedError, type ApproveSqlFn } from './sqlApprovals';
import {
    createSqlChartApprovalGate,
    SQL_CHART_DISABLED_RESULT,
    type SqlChartSaving,
} from './sqlChartApproval';

type Dependencies = {
    createContent: CreateContentFn;
    sqlChartSaving?: SqlChartSaving;
    documentsEnabled?: boolean;
    artifacts?: ArtifactChartExportAccess;
};

type CreatedContent = Awaited<ReturnType<CreateContentFn>>;

type ExecuteCreateContentResult =
    | ExecuteStructuredToolResult<
          ToolCreateContentStructuredContent,
          Extract<ToolCreateContentOutput['metadata'], { status: 'success' }>
      >
    | ExecuteToolErrorResult;

const toolDefinition = createContentToolDefinition.for('agent');

const failure = (result: string): ExecuteToolErrorResult => ({
    result,
    metadata: { status: 'error' },
    structuredContent: { error: result, refusal: null },
});

const resolveDocumentContent = async (
    content: unknown,
    artifacts: ArtifactChartExportAccess | undefined,
) => {
    const document = documentAsCodeSchema.parse(content);
    return {
        ...document,
        ...(await resolveDocumentConversationTags(document, artifacts)),
    };
};

const contentResult = ({
    content,
    href,
    type,
    warnings,
}: {
    content: unknown;
    href: string;
    type: ToolCreateContentStructuredContent['type'];
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
    sqlChartSaving = { mode: 'disabled' },
    documentsEnabled = false,
    artifacts,
}: Dependencies) => {
    const approvalGate =
        sqlChartSaving.mode === 'thread_approval'
            ? createSqlChartApprovalGate(
                  sqlChartSaving.approval,
                  'createContent',
              )
            : null;

    const getCreateArgs = async (
        args: { type: string; content: unknown },
        approveSql: ApproveSqlFn,
    ): Promise<Parameters<CreateContentFn>[0]> => {
        switch (args.type) {
            case 'document':
                return {
                    type: 'document',
                    content: await resolveDocumentContent(
                        args.content,
                        artifacts,
                    ),
                };
            case 'sql_chart':
                return {
                    type: 'sql_chart',
                    // The body is fully validated against the SQL chart
                    // schema by the content service.
                    content: toolSqlChartAsCodeSchema.parse(
                        args.content,
                    ) as SqlChartAsCode,
                    approveSql,
                };
            default:
                return args as Parameters<CreateContentFn>[0];
        }
    };

    return tool({
        ...(documentsEnabled
            ? mcpCreateContentToolDefinition.for('agent')
            : toolDefinition),
        needsApproval: async (input) =>
            input.type === 'sql_chart' &&
            approvalGate !== null &&
            approvalGate.usesNativeApproval(),
        execute: async (
            args,
            { toolCallId },
        ): Promise<ExecuteCreateContentResult> => {
            const { type, content } = args;
            const sqlChartApproval =
                type === 'sql_chart' && approvalGate
                    ? approvalGate.forToolCall({
                          toolCallId,
                          sql: (content as { sql?: string }).sql ?? '',
                          chartName: content.name,
                      })
                    : null;

            const run = async (): Promise<ExecuteCreateContentResult> => {
                try {
                    (documentsEnabled
                        ? mcpCreateContentArgsSchema
                        : toolCreateContentArgsSchema
                    ).parse(args);
                    if (
                        type === 'sql_chart' &&
                        sqlChartSaving.mode === 'disabled'
                    ) {
                        return failure(SQL_CHART_DISABLED_RESULT);
                    }
                    const result = await createContent(
                        await getCreateArgs(
                            args,
                            sqlChartApproval?.approveSql ?? (async () => {}),
                        ),
                    );
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
                    if (error instanceof SqlNotApprovedError) {
                        return failure(error.message);
                    }
                    return toolErrorOutput(
                        error,
                        `Error creating ${type} "${content.slug}". Content was not created.`,
                    );
                }
            };

            const output = await run();
            // A resumed approval was requested in an earlier run, so
            // onStepFinish will not persist this result.
            if (
                sqlChartApproval?.isResume() &&
                sqlChartSaving.mode === 'thread_approval'
            ) {
                const { getPrompt, storeToolResults } = sqlChartSaving.approval;
                const prompt = await getPrompt();
                await storeToolResults([
                    {
                        promptUuid: prompt.promptUuid,
                        toolCallId,
                        toolName: 'createContent',
                        result: output.result,
                        metadata: output.metadata,
                    },
                ]).catch(() => {
                    // Best-effort; the model already has the result.
                });
            }
            return output;
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};

import {
    editContentToolDefinition,
    isSqlApprovalToolCall,
    mcpEditContentArgsSchema,
    mcpEditContentToolDefinition,
    ParameterError,
    toolEditContentArgsSchema,
    type ToolEditContentStructuredContent,
} from '@lightdash/common';
import { tool, type FlexibleSchema } from 'ai';
import { z } from 'zod';
import type { EditContentFn } from '../types/aiAgentDependencies';
import type { ArtifactChartExportAccess } from '../utils/artifactChartAsCode';
import { getContentWarnings } from '../utils/contentWarnings';
import { resolveDocumentConversationTags } from '../utils/documentConversationTags';
import { toolFailure } from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { createSqlApprovalGate } from './sqlApprovalGate';
import {
    approveClientSql,
    SqlNotApprovedError,
    type ApproveSqlFn,
} from './sqlApprovals';
import {
    getSqlChartApproveSql,
    SQL_CHART_APPROVAL_COPY,
    SQL_CHART_DISABLED_RESULT,
    type SqlChartSaving,
} from './sqlChartApproval';

type Dependencies = {
    editContent: EditContentFn;
    sqlChartSaving?: SqlChartSaving;
    documentsEnabled?: boolean;
    artifacts?: ArtifactChartExportAccess;
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
    type: EditedContent['type'];
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

/**
 * Runs an edit exactly as the agent's editContent tool does, for callers that
 * apply an edit without the model. `approveSql` gates SQL chart edits that
 * change the SQL; without it they need `client_approved` SQL chart saving.
 */
export const executeEditContent = async (
    {
        editContent,
        sqlChartSaving = { mode: 'disabled' },
        documentsEnabled = false,
        artifacts,
    }: Dependencies,
    args: z.infer<typeof mcpEditContentArgsSchema>,
    approveSql: ApproveSqlFn | null = null,
) => {
    const { slug, type, patch, documentEdit } = args;
    try {
        (documentsEnabled
            ? mcpEditContentArgsSchema
            : toolEditContentArgsSchema
        ).parse(args);
        if (type === 'sql_chart' && sqlChartSaving.mode === 'disabled') {
            return toolFailure(SQL_CHART_DISABLED_RESULT);
        }
        const getEditArgs = async (): Promise<Parameters<EditContentFn>[0]> => {
            if (type === 'document') {
                if (patch !== undefined || documentEdit === undefined) {
                    throw new ParameterError(
                        'Documents require documentEdit instead of patch.',
                    );
                }
                return {
                    slug,
                    type,
                    documentEdit:
                        documentEdit.type === 'content'
                            ? {
                                  ...documentEdit,
                                  ...(await resolveDocumentConversationTags(
                                      documentEdit,
                                      artifacts,
                                  )),
                              }
                            : documentEdit,
                };
            }
            if (documentEdit !== undefined || patch === undefined) {
                throw new ParameterError(
                    'Charts and dashboards require patch instead of documentEdit.',
                );
            }
            if (type === 'sql_chart') {
                const sqlApproval =
                    sqlChartSaving.mode === 'client_approved'
                        ? approveClientSql
                        : approveSql;
                if (!sqlApproval) {
                    throw new ParameterError(
                        'SQL chart edits need a SQL approval step.',
                    );
                }
                return { slug, type, patch, approveSql: sqlApproval };
            }
            return { slug, type, patch };
        };
        const result = await editContent(await getEditArgs());
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
                content: result.type === 'document' ? result : result.content,
                href: metadata.href,
                type: result.type,
                warnings,
            }),
            metadata,
            structuredContent: toStructuredContent(result, warnings),
        };
    } catch (error) {
        if (error instanceof SqlNotApprovedError) {
            return toolFailure(error.message);
        }
        return toolErrorOutput(
            error,
            `Error editing ${type} "${slug}". Changes were not applied.`,
        );
    }
};

export const getEditContent = ({
    editContent,
    sqlChartSaving = { mode: 'disabled' },
    documentsEnabled = false,
    artifacts,
}: Dependencies) => {
    const definition = documentsEnabled
        ? mcpEditContentToolDefinition.for('agent')
        : toolDefinition;
    const inputSchema: FlexibleSchema<
        z.infer<typeof mcpEditContentArgsSchema>
    > = definition.inputSchema;
    const approvalGate =
        sqlChartSaving.mode === 'thread_approval'
            ? createSqlApprovalGate(
                  sqlChartSaving.approval,
                  'editContent',
                  SQL_CHART_APPROVAL_COPY,
              )
            : null;

    return tool({
        ...definition,
        inputSchema,
        needsApproval: async (input) =>
            isSqlApprovalToolCall('editContent', input) &&
            approvalGate !== null &&
            approvalGate.usesNativeApproval(),
        execute: async (args, { toolCallId }) => {
            const sqlChartApproval =
                args.type === 'sql_chart' && approvalGate
                    ? await approvalGate.forToolCall(toolCallId, {
                          needsApproval: isSqlApprovalToolCall(
                              'editContent',
                              args,
                          ),
                      })
                    : null;
            const output = await executeEditContent(
                { editContent, sqlChartSaving, documentsEnabled, artifacts },
                args,
                sqlChartApproval
                    ? getSqlChartApproveSql(sqlChartApproval)
                    : null,
            );
            return sqlChartApproval
                ? sqlChartApproval.persistIfResumed(output)
                : output;
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};

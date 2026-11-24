import {
    agentDocumentsEditContentArgsSchema,
    agentDocumentsEditContentToolDefinition,
    agentEditContentToolDefinition,
    documentEditContentArgsSchema,
    documentEditContentToolDefinition,
    editContentToolDefinition,
    mcpEditContentArgsSchema,
    mcpEditContentToolDefinition,
    ParameterError,
    toolEditContentArgsSchema,
    type ToolEditContentStructuredContent,
} from '@lightdash/common';
import { tool, type FlexibleSchema } from 'ai';
import { z } from 'zod';
import type {
    EditContentFn,
    PrepareComposerChartEditFn,
    ReadContentFn,
} from '../types/aiAgentDependencies';
import { toAbsoluteHref } from '../utils/absoluteHref';
import type { ArtifactChartExportAccess } from '../utils/artifactChartAsCode';
import { contentAck, textEditsToPatch } from '../utils/contentText';
import { getContentWarnings } from '../utils/contentWarnings';
import { resolveDocumentConversationTags } from '../utils/documentConversationTags';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import {
    approveClientSql,
    SqlNotApprovedError,
    sqlNotApprovedOutput,
    type ApproveSqlFn,
} from './sqlApprovals';
import { createSqlChartGate, type SqlChartSaving } from './sqlChartApproval';

type Dependencies = {
    editContent: EditContentFn;
    siteUrl: string;
    sqlChartSaving?: SqlChartSaving;
    documentsEnabled?: boolean;
    /** False when the actor can save Documents but not charts or dashboards. */
    chartsEnabled?: boolean;
    artifacts?: ArtifactChartExportAccess;
};

type EditedContent = Awaited<ReturnType<EditContentFn>>;

// MCP's patch-based edit; the agent edits with getAgentEditContent.
const toolDefinition = editContentToolDefinition.for('agent');

// What the actor may edit decides which args validate.
const getArgsSchema = (documentsEnabled: boolean, chartsEnabled: boolean) => {
    if (!documentsEnabled) return toolEditContentArgsSchema;
    return chartsEnabled
        ? mcpEditContentArgsSchema
        : documentEditContentArgsSchema;
};

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

// Runs an edit as the agent's tool does, for callers without the model.
// `approveSql` gates SQL chart edits; null means only client-approved saving.
export const executeEditContent = async (
    {
        editContent,
        siteUrl,
        sqlChartSaving = { mode: 'disabled' },
        documentsEnabled = false,
        chartsEnabled = true,
        artifacts,
    }: Dependencies,
    args: z.infer<typeof mcpEditContentArgsSchema>,
    approveSql: ApproveSqlFn | null = null,
    // The agent gets a short ack; other callers get the edited content.
    resultFormat: 'content' | 'ack' = 'content',
) => {
    const { slug, type } = args;
    // Models send null for the one of these they leave unused
    const patch = args.patch ?? null;
    const documentEdit = args.documentEdit ?? null;
    try {
        getArgsSchema(documentsEnabled, chartsEnabled).parse(args);
        const getEditArgs = async (): Promise<Parameters<EditContentFn>[0]> => {
            if (type === 'document') {
                if (patch !== null || documentEdit === null) {
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
            if (documentEdit !== null || patch === null) {
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
            if (type === 'composer_chart') {
                return {
                    slug,
                    type,
                    patch,
                    approveSql:
                        sqlChartSaving.mode === 'client_approved'
                            ? approveClientSql
                            : approveSql,
                };
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

        const absoluteHref = toAbsoluteHref(siteUrl, result.href);
        if (resultFormat === 'ack' && result.type !== 'document') {
            return {
                result: contentAck(
                    {
                        type: result.type,
                        href: result.href,
                        slug: result.content.slug,
                        warnings,
                    },
                    siteUrl,
                ),
                metadata,
                structuredContent: toStructuredContent(result, warnings),
            };
        }
        return {
            result: contentResult({
                content:
                    result.type === 'document'
                        ? { ...result, href: absoluteHref }
                        : result.content,
                href: absoluteHref,
                type: result.type,
                warnings,
            }),
            metadata,
            structuredContent: toStructuredContent(result, warnings),
        };
    } catch (error) {
        if (error instanceof SqlNotApprovedError) {
            return sqlNotApprovedOutput(error);
        }
        return toolErrorOutput(
            error,
            `Error editing ${type} "${slug}". Changes were not applied.`,
        );
    }
};

export const getEditContent = ({
    editContent,
    prepareComposerChartEdit,
    siteUrl,
    sqlChartSaving = { mode: 'disabled' },
}: Pick<Dependencies, 'editContent' | 'siteUrl' | 'sqlChartSaving'> & {
    // Null where no thread approval runs (MCP clients approve their own calls).
    prepareComposerChartEdit: PrepareComposerChartEditFn | null;
}) => {
    const inputSchema: FlexibleSchema<
        z.infer<typeof toolEditContentArgsSchema>
    > = toolDefinition.inputSchema;
    const sqlChartGate = createSqlChartGate(
        sqlChartSaving,
        'editContent',
        prepareComposerChartEdit
            ? async (args) => {
                  const { slug, patch } = toolEditContentArgsSchema
                      .pick({ slug: true, patch: true })
                      .parse(args);
                  const { approvalSql } = await prepareComposerChartEdit({
                      slug,
                      patch,
                  });
                  return approvalSql;
              }
            : null,
    );

    return tool({
        ...toolDefinition,
        inputSchema,
        needsApproval: sqlChartGate.needsApproval,
        execute: (args, { toolCallId }) =>
            sqlChartGate.run({ toolCallId, args }, (approveSql) =>
                executeEditContent(
                    { editContent, siteUrl, sqlChartSaving },
                    args,
                    approveSql,
                ),
            ),
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};

const getAgentToolVariant = (
    documentsEnabled: boolean,
    chartsEnabled: boolean,
) => {
    if (!documentsEnabled) return agentEditContentToolDefinition.for('agent');
    return chartsEnabled
        ? agentDocumentsEditContentToolDefinition.for('agent')
        : documentEditContentToolDefinition.for('agent');
};

type AgentEditContentArgs = z.infer<typeof agentDocumentsEditContentArgsSchema>;
type PatchEditContentArgs = z.infer<typeof mcpEditContentArgsSchema>;

/** The agent's edit tool: text edits on the content as readContent shows it. */
export const getAgentEditContent = ({
    editContent,
    readContent,
    prepareComposerChartEdit,
    siteUrl,
    sqlChartSaving = { mode: 'disabled' },
    documentsEnabled = false,
    chartsEnabled = true,
    artifacts,
}: Dependencies & {
    readContent: ReadContentFn;
    prepareComposerChartEdit: PrepareComposerChartEditFn;
}) => {
    const definition = getAgentToolVariant(documentsEnabled, chartsEnabled);
    const inputSchema: FlexibleSchema<AgentEditContentArgs> =
        definition.inputSchema;
    const deps = {
        editContent,
        siteUrl,
        sqlChartSaving,
        documentsEnabled,
        chartsEnabled,
        artifacts,
    };

    // The SQL gate and the service work on the patch the text edits make.
    const toPatchArgs = async (
        args: AgentEditContentArgs,
    ): Promise<PatchEditContentArgs> => {
        const { slug, type } = args;
        if (type === 'document') {
            return { slug, type, documentEdit: args.documentEdit ?? null };
        }
        if (!args.edits || args.edits.length === 0) {
            throw new ParameterError(
                'Charts and dashboards require edits instead of documentEdit.',
            );
        }
        const current = await readContent({ slug, type });
        return {
            slug,
            type,
            patch: textEditsToPatch(current.content, args.edits),
        };
    };

    const sqlChartGate = createSqlChartGate(
        sqlChartSaving,
        'editContent',
        async (args) => {
            const { slug, patch } = toolEditContentArgsSchema
                .pick({ slug: true, patch: true })
                .parse(args);
            const { approvalSql } = await prepareComposerChartEdit({
                slug,
                patch,
            });
            return approvalSql;
        },
    );

    return tool({
        ...definition,
        inputSchema,
        needsApproval: async (args, options) => {
            if (args.type !== 'sql_chart' && args.type !== 'composer_chart')
                return sqlChartGate.needsApproval(args, options);
            // A refused edit asks nothing; running it reports the refusal.
            const patchArgs = await toPatchArgs(args).catch(() => null);
            return patchArgs !== null
                ? sqlChartGate.needsApproval(patchArgs, options)
                : false;
        },
        execute: async (args, { toolCallId }) => {
            let patchArgs: PatchEditContentArgs;
            try {
                patchArgs = await toPatchArgs(args);
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error editing ${args.type} "${args.slug}". Changes were not applied.`,
                );
            }
            return sqlChartGate.run(
                { toolCallId, args: patchArgs },
                (approveSql) =>
                    executeEditContent(deps, patchArgs, approveSql, 'ack'),
            );
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};

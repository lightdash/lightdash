import {
    describeModelFragmentRefusal,
    draftProjectContextToolDefinition,
    endsTurnOnCard,
    listChangesToolDefinition,
    METRIC_VIEW_TABLE_TYPE,
    ParameterError,
    proposeSemanticLayerChangeToolDefinition,
    readSemanticModelToolDefinition,
    type SemanticLayerDraftModelInput,
    type SemanticLayerProposal,
    type SemanticLayerProposalItemResult,
    type StudioChangeSummary,
    type ToolDraftProjectContextOutput,
    type ToolProposeSemanticLayerChangeArgs,
    type ToolProposeSemanticLayerChangeOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import {
    findMetricsToRun,
    findNewModelAdvice,
} from '../../SemanticStudioService/draftLint';
import {
    buildMetricViewModelYaml,
    quoteIdentifier,
} from '../../SemanticStudioService/metricViewModel';
import type {
    DescribeWarehouseTableFn,
    DraftProjectContextFn,
    ProposeSemanticLayerChangeFn,
    ReadSemanticModelFn,
} from '../types/aiAgentDependencies';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const renderProposedModel = (
    {
        model,
        status,
        changes,
        refusals,
        error,
        notes,
    }: SemanticLayerProposalItemResult,
    advice: string[],
    metricsToRun: string[],
): string =>
    [
        `${model}: ${status}`,
        ...(changes.length > 0
            ? [
                  `  changes: ${changes.map(({ path, action }) => `${action} ${path}`).join(', ')}`,
              ]
            : []),
        ...(refusals.length > 0
            ? [
                  `  refusals: ${refusals.map(describeModelFragmentRefusal).join(' ')}`,
              ]
            : []),
        ...(error ? [`  error: ${error}`] : []),
        ...notes.map((note) => `  note: ${note}`),
        ...advice.map((line) => `  advice: ${line}`),
        ...(metricsToRun.length > 0
            ? [
                  `  check: run ${metricsToRun.join(', ')} once with runMetricQuery, which reads the draft. A null, a zero or a total the table cannot produce means the definition is wrong: propose the fix. Otherwise end the turn.`,
              ]
            : []),
    ].join('\n');

/** A model can escape the quotes inside a string it writes; the card shows text, so they are plain again. */
const unescapeQuotes = (text: string): string => text.replaceAll('\\"', '"');

type ProposedModel = ToolProposeSemanticLayerChangeArgs['models'][number];

/** Turns an entry that imports a metric view into the fragment built from the warehouse's description of it. */
const resolveMetricViewImport = async (
    { fromMetricView, ...model }: ProposedModel,
    describeWarehouseTable: DescribeWarehouseTableFn,
    readSemanticModel: ReadSemanticModelFn,
): Promise<SemanticLayerDraftModelInput> => {
    if (fromMetricView === null) return model;
    if (model.yaml !== null) {
        throw new ParameterError(
            `${model.name}: give either yaml or fromMetricView, not both. Import the metric view first, then propose changes to it.`,
        );
    }
    const [described, existing] = await Promise.all([
        describeWarehouseTable(fromMetricView),
        readSemanticModel(model.name),
    ]);
    if (described.metadata?.tableType !== METRIC_VIEW_TABLE_TYPE) {
        throw new ParameterError(
            `${fromMetricView.table} is not a metric view, so write its model as yaml from describeWarehouseTable.`,
        );
    }
    if (described.metadata.metricView?.parameterized) {
        throw new ParameterError(
            `${fromMetricView.table} takes parameters, so it is queried as a table function and cannot be a model's table. Tell the person it cannot be imported yet.`,
        );
    }
    return {
        ...model,
        yaml: buildMetricViewModelYaml({
            modelName: model.name,
            sqlFrom: [
                described.resolvedDatabase,
                described.resolvedSchema,
                fromMetricView.table,
            ]
                .flatMap((part) => (part === null ? [] : [part]))
                .map(quoteIdentifier)
                .join('.'),
            metadata: described.metadata,
            existingModelYaml: existing.content,
        }),
    };
};

export const getProposeSemanticLayerChange = ({
    proposeSemanticLayerChange,
    describeWarehouseTable,
    readSemanticModel,
    canRunMetrics,
}: {
    proposeSemanticLayerChange: ProposeSemanticLayerChangeFn;
    describeWarehouseTable: DescribeWarehouseTableFn;
    readSemanticModel: ReadSemanticModelFn;
    /** Whether the agent can run a metric on the draft, so a changed one is checked on real rows before the turn ends. */
    canRunMetrics: boolean;
}) =>
    tool({
        ...proposeSemanticLayerChangeToolDefinition.for('agent'),
        execute: async ({ models, changeName, note, options }) => {
            try {
                const { results, diffs, draftChangeUuid, startedChange } =
                    await proposeSemanticLayerChange(
                        await Promise.all(
                            models.map((model) =>
                                resolveMetricViewImport(
                                    model,
                                    describeWarehouseTable,
                                    readSemanticModel,
                                ),
                            ),
                        ),
                        changeName,
                    );
                const advised = results.map((result) => {
                    const created = diffs.find(
                        ({ model, contentBefore }) =>
                            model === result.model && contentBefore === null,
                    );
                    const isReady = result.status === 'ready';
                    return {
                        result,
                        advice:
                            isReady && created?.contentAfter
                                ? findNewModelAdvice(
                                      result.model,
                                      created.contentAfter,
                                  )
                                : [],
                        metricsToRun:
                            isReady && canRunMetrics
                                ? findMetricsToRun(
                                      result.model,
                                      result.changes,
                                      created?.contentAfter ?? null,
                                  )
                                : [],
                    };
                });
                const metadata: SemanticLayerProposal = {
                    status: 'success',
                    models: results,
                    diffs,
                    draftChangeUuid,
                    startedChange,
                    needsFollowUp: advised.some(
                        ({ advice, metricsToRun }) =>
                            advice.length > 0 || metricsToRun.length > 0,
                    ),
                    note:
                        draftChangeUuid && note !== null
                            ? unescapeQuotes(note)
                            : null,
                    options: draftChangeUuid ? options.map(unescapeQuotes) : [],
                };
                const joinedLine = endsTurnOnCard([metadata])
                    ? "This joined the person's draft, and its card shows them what changed, your note and your options, so write nothing more. Nothing is published until they publish the draft."
                    : "This joined the person's draft. Nothing is published until they publish the draft.";
                const output: ToolProposeSemanticLayerChangeOutput = {
                    result: [
                        ...advised.map(({ result, advice, metricsToRun }) =>
                            renderProposedModel(result, advice, metricsToRun),
                        ),
                        ...(startedChange
                            ? [
                                  `Started draft "${startedChange.name}" and checked it out.`,
                              ]
                            : []),
                        draftChangeUuid
                            ? joinedLine
                            : 'Nothing joined the draft.',
                    ].join('\n'),
                    metadata,
                    structuredContent: { models: results },
                };
                return output;
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error checking the semantic layer change.',
                );
            }
        },
    });

export const getReadSemanticModel = ({
    readSemanticModel,
}: {
    readSemanticModel: ReadSemanticModelFn;
}) =>
    tool({
        ...readSemanticModelToolDefinition.for('agent'),
        execute: async ({ name }) => {
            try {
                const read = await readSemanticModel(name);
                const describe = () => {
                    if (read.content !== null) {
                        return `${read.inDraft ? 'This is the draft of this model; it is not live yet.\n' : ''}${read.content}`;
                    }
                    return read.inDraft
                        ? `The draft removes ${name}; it is still live until the draft is published.`
                        : `No model is named ${name}. Models: ${read.modelNames.join(', ') || 'none yet'}.`;
                };
                return {
                    result: describe(),
                    metadata: { status: 'success' as const },
                    structuredContent: read,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error reading the semantic model.',
                );
            }
        },
    });

export const getListChanges = (
    listChanges: () => Promise<StudioChangeSummary[]>,
) =>
    tool({
        ...listChangesToolDefinition.for('agent'),
        execute: async () => {
            try {
                const changes = await listChanges();
                return {
                    result: JSON.stringify(changes),
                    structuredContent: { changes },
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error listing your changes.');
            }
        },
    });

export const getDraftProjectContext = ({
    draftProjectContext,
}: {
    draftProjectContext: DraftProjectContextFn;
}) =>
    tool({
        ...draftProjectContextToolDefinition.for('agent'),
        execute: async ({
            op,
            id,
            kind,
            content,
            terms,
            objects,
            changeName,
        }): Promise<ToolDraftProjectContextOutput> => {
            try {
                const drafted = await draftProjectContext(
                    { op, id, kind, content, terms, objects },
                    changeName,
                );
                return {
                    result: [
                        `${drafted.op === 'update' ? 'Replaced' : 'Added'} project context entry "${drafted.entryId}" in the draft.`,
                        ...(drafted.startedChange
                            ? [
                                  `Started draft "${drafted.startedChange.name}" and checked it out.`,
                              ]
                            : []),
                        'Agents read it once the person publishes the draft; say so in one sentence.',
                    ].join('\n'),
                    metadata: { status: 'success' },
                    structuredContent: {
                        entryId: drafted.entryId,
                        op: drafted.op,
                        draftChangeUuid: drafted.draftChangeUuid,
                    },
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error adding the project context entry to the draft.',
                );
            }
        },
    });

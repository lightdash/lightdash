import {
    assertUnreachable,
    DEFAULT_FILTER_CASE_SENSITIVE,
    DimensionType,
    discoverFieldsToolDefinition,
    Explore,
    Field,
    FieldType,
    getFilterTypeFromItemType,
    getItemId,
    getVisibleFields,
    isDimension,
    isMetric,
    type Dimension,
    type Metric,
    type ToolDiscoverFieldsOutput,
} from '@lightdash/common';
import {
    readUIMessageStream,
    tool,
    type CallSettings,
    type LanguageModel,
    type UIMessage,
} from 'ai';
import { stringifyToolJson } from '../../tools/toolOutputFormat';
import type { AiAgentArgs } from '../../types/aiAgent';
import { getExploreRequiredFilters } from '../../utils/requiredFilters';
import { toModelOutput } from '../../utils/toModelOutput';
import { toolErrorHandler } from '../../utils/toolErrorHandler';
import {
    runDiscoverFieldsAgent,
    type DiscoverFieldsAgentDependencies,
} from './agent';
import {
    discoverFieldsSelectionSchemaV2,
    type DiscoverFieldsResult,
    type DiscoverFieldsSelectionV2,
} from './schema';

const discoverFieldsTool = discoverFieldsToolDefinition.for('agent');

const ambiguousNote =
    'Multiple explores plausibly answer this. Ask the user the suggestedQuestion. Do NOT call generateVisualization.';

const getCaseSensitiveFilters = (
    field: Field,
    explore: Explore,
): 'true' | 'false' | 'not_applicable' => {
    if (
        field.fieldType !== FieldType.DIMENSION ||
        field.type !== DimensionType.STRING
    ) {
        return 'not_applicable';
    }

    const dimension = explore.tables[field.table]?.dimensions[field.name];
    return (dimension?.caseSensitive ??
        explore.caseSensitive ??
        DEFAULT_FILTER_CASE_SENSITIVE)
        ? 'true'
        : 'false';
};

const isFromJoinedTable = (field: Field, explore: Explore) =>
    field.table !== explore.baseTable &&
    explore.joinedTables.some((join) => join.table === field.table);

const hydrateField = ({
    fieldId,
    field,
    explore,
}: {
    fieldId: string;
    field: Dimension | Metric;
    explore: Explore;
}) => ({
    fieldId,
    name: field.name,
    label: field.label,
    table: field.table,
    fieldType: field.fieldType,
    fieldValueType: String(field.type),
    fieldFilterType: getFilterTypeFromItemType(field.type),
    caseSensitiveFilters: getCaseSensitiveFilters(field, explore),
    isFromJoinedTable: isFromJoinedTable(field, explore),
    description: field.description ?? null,
});

const hydrateDimensionField = (args: {
    fieldId: string;
    field: Dimension;
    explore: Explore;
}) => ({
    ...hydrateField(args),
    fieldType: 'dimension' as const,
});

const hydrateMetricField = (args: {
    fieldId: string;
    field: Metric;
    explore: Explore;
}) => ({
    ...hydrateField(args),
    fieldType: 'metric' as const,
});

const hydrateResolvedSelection = async ({
    selection,
    getExplore,
}: {
    selection: Extract<DiscoverFieldsSelectionV2, { status: 'resolved' }>;
    getExplore: DiscoverFieldsAgentDependencies['getExplore'];
}): Promise<Extract<DiscoverFieldsResult, { status: 'resolved' }>> => {
    if (
        selection.dimensionIds.length === 0 &&
        selection.metricIds.length === 0
    ) {
        throw new Error('Resolved discovery must select at least one field.');
    }

    const explore = await getExplore({ table: selection.exploreName });
    const itemMap = Object.fromEntries(
        getVisibleFields(explore).map((field) => [getItemId(field), field]),
    );

    const dimensions = selection.dimensionIds.map((fieldId) => {
        const item = itemMap[fieldId];
        if (!isDimension(item)) {
            throw new Error(
                `Dimension "${fieldId}" was not found in explore "${selection.exploreName}".`,
            );
        }

        return hydrateDimensionField({ fieldId, field: item, explore });
    });

    const metrics = selection.metricIds.map((fieldId) => {
        const item = itemMap[fieldId];
        if (!isMetric(item)) {
            throw new Error(
                `Metric "${fieldId}" was not found in explore "${selection.exploreName}".`,
            );
        }

        return hydrateMetricField({ fieldId, field: item, explore });
    });

    return {
        status: 'resolved',
        explore: {
            name: explore.name,
            label: explore.label,
            baseTable: explore.baseTable,
            joinedTables: explore.joinedTables.map((join) => join.table),
            requiredFilters: getExploreRequiredFilters(explore),
        },
        dimensions,
        metrics,
        fields: [...dimensions, ...metrics],
        rationale: selection.rationale,
        uncertainties: selection.uncertainties,
    };
};

const hydrateSelection = async ({
    selection,
    availableExplores,
    getExplore,
}: {
    selection: DiscoverFieldsSelectionV2;
    availableExplores: Explore[];
    getExplore: DiscoverFieldsAgentDependencies['getExplore'];
}): Promise<DiscoverFieldsResult> => {
    switch (selection.status) {
        case 'resolved':
            return hydrateResolvedSelection({ selection, getExplore });
        case 'ambiguous':
            return {
                status: 'ambiguous',
                candidates: selection.candidates.map((candidate) => {
                    const explore = availableExplores.find(
                        (availableExplore) =>
                            availableExplore.name === candidate.exploreName,
                    );
                    return {
                        exploreName: candidate.exploreName,
                        exploreLabel: explore?.label ?? candidate.exploreName,
                        reason: candidate.reason,
                    };
                }),
                suggestedQuestion: selection.suggestedQuestion,
                uncertainties: selection.uncertainties,
            };
        case 'no_match':
            return selection;
        default:
            return assertUnreachable(selection, 'Unknown discovery status');
    }
};

const getStructuredField = (
    field: Extract<
        DiscoverFieldsResult,
        { status: 'resolved' }
    >['fields'][number],
) => ({
    fieldId: field.fieldId,
    name: field.name,
    label: field.label,
    table: field.table,
    type: field.fieldType,
    fieldType: field.fieldType,
    fieldValueType: field.fieldValueType,
    fieldFilterType: field.fieldFilterType,
    isFromJoinedTable: field.isFromJoinedTable,
    ...(field.caseSensitiveFilters === 'not_applicable'
        ? {}
        : {
              caseSensitiveFilters: field.caseSensitiveFilters === 'true',
          }),
    description: field.description,
});

const getResolvedStructuredResult = (
    result: Extract<DiscoverFieldsResult, { status: 'resolved' }>,
) => ({
    status: 'resolved' as const,
    explore: {
        name: result.explore.name,
        label: result.explore.label,
        baseTable: result.explore.baseTable,
        joinedTables: {
            count: result.explore.joinedTables.length,
            tables: result.explore.joinedTables,
        },
        requiredFilters: result.explore.requiredFilters ?? [],
    },
    dimensions: {
        count: result.dimensions.length,
        items: result.dimensions.map(getStructuredField),
    },
    metrics: {
        count: result.metrics.length,
        items: result.metrics.map(getStructuredField),
    },
    rationale: result.rationale,
    uncertainties: result.uncertainties,
});

const getAmbiguousStructuredResult = (
    result: Extract<DiscoverFieldsResult, { status: 'ambiguous' }>,
) => ({
    status: 'ambiguous' as const,
    note: ambiguousNote,
    candidates: {
        count: result.candidates.length,
        items: result.candidates.map((candidate) => ({
            name: candidate.exploreName,
            label: candidate.exploreLabel,
            exploreName: candidate.exploreName,
            exploreLabel: candidate.exploreLabel,
            reason: candidate.reason,
        })),
    },
    suggestedQuestion: result.suggestedQuestion,
    uncertainties: result.uncertainties,
});

const getNoMatchStructuredResult = (
    result: Extract<DiscoverFieldsResult, { status: 'no_match' }>,
) => ({
    status: 'no_match' as const,
    reason: result.reason,
    uncertainties: result.uncertainties,
});

const getStructuredResult = (result: DiscoverFieldsResult) => {
    switch (result.status) {
        case 'resolved':
            return getResolvedStructuredResult(result);
        case 'ambiguous':
            return getAmbiguousStructuredResult(result);
        case 'no_match':
            return getNoMatchStructuredResult(result);
        default:
            return assertUnreachable(result, 'Unknown discovery status');
    }
};

const getToolTraceSignature = (message: UIMessage): string =>
    message.parts
        .filter((part) => part.type.startsWith('tool-'))
        .map((part) => {
            const toolCallId =
                'toolCallId' in part && typeof part.toolCallId === 'string'
                    ? part.toolCallId
                    : '';
            const hasInput = 'input' in part && part.input !== undefined;
            return `${part.type}:${toolCallId}:${hasInput ? '1' : '0'}`;
        })
        .join('|');

const getStreamingToolOutput = (
    streamingMessage: UIMessage,
): ToolDiscoverFieldsOutput =>
    ({
        result: '',
        metadata: {
            status: 'streaming' as const,
            streamingMessage,
        },
    }) as unknown as ToolDiscoverFieldsOutput;

const extractSelectionFromSubmitResult = (
    message: UIMessage | undefined,
): DiscoverFieldsSelectionV2 | { error: string } => {
    if (!message) {
        return { error: 'Subagent produced no output.' };
    }
    const submitPart = message.parts.findLast(
        (p): p is typeof p & { input?: unknown } =>
            p.type === 'tool-submitResult',
    );
    if (!submitPart || submitPart.input === undefined) {
        return {
            error: 'Subagent did not call submitResult before the stream ended.',
        };
    }
    const parsed = discoverFieldsSelectionSchemaV2.safeParse(submitPart.input);
    if (!parsed.success) {
        return {
            error: `submitResult payload failed schema validation: ${parsed.error.message}`,
        };
    }
    return parsed.data.handoff;
};

type Dependencies = DiscoverFieldsAgentDependencies;

type ToolArgs = {
    model: LanguageModel;
    callOptions: CallSettings;
    providerOptions: AiAgentArgs['providerOptions'];
    availableExplores: Explore[];
    findFieldsPageSize: number;
    promptUuid: string;
    telemetry: Pick<
        AiAgentArgs,
        | 'agentSettings'
        | 'threadUuid'
        | 'promptUuid'
        | 'telemetryEnabled'
        | 'model'
    >;
};

export const getDiscoverFields = (args: ToolArgs, dependencies: Dependencies) =>
    tool({
        ...discoverFieldsTool,
        async *execute(input, { toolCallId, abortSignal }) {
            try {
                const { stream, flushPersistence } = runDiscoverFieldsAgent(
                    {
                        input,
                        availableExplores: args.availableExplores,
                        model: args.model,
                        callOptions: args.callOptions,
                        providerOptions: args.providerOptions,
                        findFieldsPageSize: args.findFieldsPageSize,
                        promptUuid: args.promptUuid,
                        parentToolCallId: toolCallId,
                        telemetry: args.telemetry,
                        abortSignal,
                    },
                    dependencies,
                );

                let currentMessage: UIMessage | undefined;
                let lastTraceSignature: string | null = null;
                for await (const message of readUIMessageStream({
                    stream: stream.toUIMessageStream(),
                })) {
                    currentMessage = message;
                    const traceSignature = getToolTraceSignature(message);
                    if (
                        traceSignature &&
                        traceSignature !== lastTraceSignature
                    ) {
                        lastTraceSignature = traceSignature;
                        yield getStreamingToolOutput(message);
                    }
                }

                await flushPersistence();

                const selection =
                    extractSelectionFromSubmitResult(currentMessage);
                if ('error' in selection) {
                    yield {
                        result: toolErrorHandler(
                            new Error(selection.error),
                            'Error discovering fields.',
                            { captureToSentry: false },
                        ),
                        metadata: { status: 'error' as const },
                    };
                    return;
                }

                const handoff = await hydrateSelection({
                    selection,
                    availableExplores: args.availableExplores,
                    getExplore: dependencies.getExplore,
                });

                const structuredResult = getStructuredResult(handoff);

                yield {
                    result: stringifyToolJson(structuredResult),
                    structuredResult,
                    metadata: {
                        status: 'success' as const,
                        discovery: handoff,
                        streamingMessage: currentMessage,
                    },
                } as ToolDiscoverFieldsOutput;
            } catch (error) {
                yield {
                    result: toolErrorHandler(
                        error,
                        'Error discovering fields.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

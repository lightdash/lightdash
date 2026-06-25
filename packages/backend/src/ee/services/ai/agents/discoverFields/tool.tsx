import {
    DEFAULT_FILTER_CASE_SENSITIVE,
    DimensionType,
    discoverFieldsToolDefinition,
    Explore,
    Field,
    FieldType,
    getFilterTypeFromItemType,
    getItemMap,
    isDimension,
    isMetric,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import {
    readUIMessageStream,
    tool,
    type CallSettings,
    type LanguageModel,
    type UIMessage,
} from 'ai';
import {
    stringifyToolJson,
    type ToolOutputFormat,
} from '../../tools/toolOutputFormat';
import type { AiAgentArgs } from '../../types/aiAgent';
import { toModelOutput } from '../../utils/toModelOutput';
import { toolErrorHandler } from '../../utils/toolErrorHandler';
import { xmlBuilder } from '../../xmlBuilder';
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

const hydrateResolvedSelection = async ({
    selection,
    getExplore,
}: {
    selection: Extract<DiscoverFieldsSelectionV2, { status: 'resolved' }>;
    getExplore: DiscoverFieldsAgentDependencies['getExplore'];
}): Promise<Extract<DiscoverFieldsResult, { status: 'resolved' }>> => {
    const explore = await getExplore({ table: selection.exploreName });
    const itemMap = getItemMap(explore);
    const fields = selection.fieldIds.map((fieldId) => {
        const item = itemMap[fieldId];
        if (!isDimension(item) && !isMetric(item)) {
            throw new Error(
                `Field "${fieldId}" was not found in explore "${selection.exploreName}".`,
            );
        }

        return hydrateField({ fieldId, field: item, explore });
    });

    return {
        status: 'resolved',
        explore: {
            name: explore.name,
            label: explore.label,
            baseTable: explore.baseTable,
            joinedTables: explore.joinedTables.map((join) => join.table),
        },
        fields,
        rationale: selection.rationale,
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
            };
        case 'no_match':
            return selection;
        default:
            return selection;
    }
};

const renderResolvedJson = (
    result: Extract<DiscoverFieldsResult, { status: 'resolved' }>,
) =>
    stringifyToolJson({
        status: 'resolved',
        explore: {
            name: result.explore.name,
            label: result.explore.label,
            baseTable: result.explore.baseTable,
            joinedTables: {
                count: result.explore.joinedTables.length,
                tables: result.explore.joinedTables,
            },
        },
        fields: {
            count: result.fields.length,
            items: result.fields.map((f) => ({
                fieldId: f.fieldId,
                name: f.name,
                label: f.label,
                table: f.table,
                type: f.fieldType,
                fieldType: f.fieldType,
                fieldValueType: f.fieldValueType,
                fieldFilterType: f.fieldFilterType,
                isFromJoinedTable: f.isFromJoinedTable,
                ...(f.caseSensitiveFilters === 'not_applicable'
                    ? {}
                    : {
                          caseSensitiveFilters:
                              f.caseSensitiveFilters === 'true',
                      }),
                description: f.description,
            })),
        },
        rationale: result.rationale,
    });

const renderResolved = (
    result: Extract<DiscoverFieldsResult, { status: 'resolved' }>,
) => (
    <discovery status="resolved">
        <explore
            name={result.explore.name}
            label={result.explore.label}
            baseTable={result.explore.baseTable}
        >
            {result.explore.joinedTables.length > 0 && (
                <joinedTables>
                    {result.explore.joinedTables.map((t) => (
                        <table>{t}</table>
                    ))}
                </joinedTables>
            )}
        </explore>
        <fields count={result.fields.length}>
            {result.fields.map((f) => (
                <field
                    fieldId={f.fieldId}
                    name={f.name}
                    label={f.label}
                    table={f.table}
                    type={f.fieldType}
                    fieldValueType={f.fieldValueType}
                    fieldFilterType={f.fieldFilterType}
                    isFromJoinedTable={f.isFromJoinedTable}
                    {...(f.caseSensitiveFilters === 'not_applicable'
                        ? {}
                        : {
                              caseSensitiveFilters:
                                  f.caseSensitiveFilters === 'true',
                          })}
                >
                    {f.description ? (
                        <description>{f.description}</description>
                    ) : null}
                </field>
            ))}
        </fields>
        {result.rationale && <rationale>{result.rationale}</rationale>}
    </discovery>
);

const renderAmbiguous = (
    result: Extract<DiscoverFieldsResult, { status: 'ambiguous' }>,
) => (
    <discovery status="ambiguous">
        <note>{ambiguousNote}</note>
        <candidates>
            {result.candidates.map((c) => (
                <candidate name={c.exploreName} label={c.exploreLabel}>
                    {c.reason}
                </candidate>
            ))}
        </candidates>
        <suggestedQuestion>{result.suggestedQuestion}</suggestedQuestion>
    </discovery>
);

const renderAmbiguousJson = (
    result: Extract<DiscoverFieldsResult, { status: 'ambiguous' }>,
) =>
    stringifyToolJson({
        status: 'ambiguous',
        note: ambiguousNote,
        candidates: {
            count: result.candidates.length,
            items: result.candidates.map((c) => ({
                name: c.exploreName,
                label: c.exploreLabel,
                exploreName: c.exploreName,
                exploreLabel: c.exploreLabel,
                reason: c.reason,
            })),
        },
        suggestedQuestion: result.suggestedQuestion,
    });

const renderNoMatchJson = (
    result: Extract<DiscoverFieldsResult, { status: 'no_match' }>,
) =>
    stringifyToolJson({
        status: 'no_match',
        reason: result.reason,
    });

const renderNoMatch = (
    result: Extract<DiscoverFieldsResult, { status: 'no_match' }>,
) => (
    <discovery status="no_match">
        <reason>{result.reason}</reason>
    </discovery>
);

const renderResult = (
    result: DiscoverFieldsResult,
    outputFormat: ToolOutputFormat,
): string => {
    switch (result.status) {
        case 'resolved':
            return outputFormat === 'json'
                ? renderResolvedJson(result)
                : renderResolved(result).toString();
        case 'ambiguous':
            return outputFormat === 'json'
                ? renderAmbiguousJson(result)
                : renderAmbiguous(result).toString();
        case 'no_match':
            return outputFormat === 'json'
                ? renderNoMatchJson(result)
                : renderNoMatch(result).toString();
        default:
            return '';
    }
};

/**
 * Locate the subagent's final `submitResult` tool call in the accumulated
 * UIMessage and parse its selector payload. AI SDK has already validated the
 * input against the same V2 schema before invoking the tool, so this safeParse
 * is defence-in-depth for the unknown UIMessage input type.
 */
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
    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    outputFormat: ToolOutputFormat;
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

/**
 * Schema enforcement is structural, not prompt-based: the subagent's final
 * step is a `submitResult` tool call whose `inputSchema` is the result
 * union. AI SDK validates the args at the tool-call boundary, so the
 * handoff arrives already-typed — no JSON.parse, no fence stripping,
 * no post-stream coercion.
 *
 * The final yield extracts the handoff from the submitResult tool call
 * and renders the XML the parent model sees via `toModelOutput`.
 * Subagent's `storeToolCall` writes are awaited before the final yield
 * so the parent's tool-result row never commits before the children rows.
 */
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
                        findExploresFieldSearchSize:
                            args.findExploresFieldSearchSize,
                        findFieldsPageSize: args.findFieldsPageSize,
                        outputFormat: args.outputFormat,
                        promptUuid: args.promptUuid,
                        parentToolCallId: toolCallId,
                        telemetry: args.telemetry,
                        abortSignal,
                    },
                    dependencies,
                );

                let currentMessage: UIMessage | undefined;
                // Yield only on tool-call structural changes; per-chunk
                // yields re-emit the accumulated UIMessage and grow the
                // parent stream quadratically.
                let lastTraceSignature: string | null = null;
                for await (const message of readUIMessageStream({
                    stream: stream.toUIMessageStream(),
                })) {
                    currentMessage = message;
                    const traceSignature = message.parts
                        .filter((p) => p.type.startsWith('tool-'))
                        .map((p) => {
                            const toolPart = p as {
                                type: string;
                                toolCallId?: string;
                                input?: unknown;
                            };
                            return `${toolPart.type}:${
                                toolPart.toolCallId ?? ''
                            }:${toolPart.input != null ? '1' : '0'}`;
                        })
                        .join('|');
                    if (
                        traceSignature &&
                        traceSignature !== lastTraceSignature
                    ) {
                        lastTraceSignature = traceSignature;
                        yield {
                            result: '',
                            metadata: {
                                status: 'streaming' as const,
                                streamingMessage: message,
                            },
                        };
                    }
                }

                await flushPersistence();

                const selection =
                    extractSelectionFromSubmitResult(currentMessage);
                if ('error' in selection) {
                    // Soft, parent-recoverable model-output anomaly; parent retries on tool-error.
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

                yield {
                    result: renderResult(handoff, args.outputFormat),
                    metadata: {
                        status: 'success' as const,
                        discovery: handoff,
                    },
                };
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

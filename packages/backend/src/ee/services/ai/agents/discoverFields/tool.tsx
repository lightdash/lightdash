import { Explore } from '@lightdash/common';
import {
    readUIMessageStream,
    tool,
    type CallSettings,
    type LanguageModel,
    type UIMessage,
} from 'ai';
import type { AiAgentArgs } from '../../types/aiAgent';
import { toModelOutput } from '../../utils/toModelOutput';
import { toolErrorHandler } from '../../utils/toolErrorHandler';
import { xmlBuilder } from '../../xmlBuilder';
import {
    runDiscoverFieldsAgent,
    type DiscoverFieldsAgentDependencies,
} from './agent';
import {
    discoverFieldsInputSchema,
    discoverFieldsResultSchema,
    type DiscoverFieldsResult,
} from './schema';

const DISCOVER_FIELDS_DESCRIPTION = `Tool: discoverFields

Purpose:
Run the data-discovery subagent. Given the latest user query, returns a structured handoff describing which explore and which fields to use to answer it.

Use this tool as the FIRST step whenever the user asks a data question (counts, totals, breakdowns, trends, "what is", "show me", "how many"). Do NOT call this when the user is only asking about existing dashboards/charts (use findContent) or follow-up clarifications about a chart you already produced.

You will receive one of three statuses:
- "resolved" — proceed with runQuery (or generateDashboard) using the returned explore + fields.
- "ambiguous" — surface the suggestedQuestion to the user; do NOT call runQuery.
- "no_match" — explain back to the user that no data source covers the request.

Re-call this tool if the user pivots mid-thread to a different data topic and you need fields from a different explore.
`;

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
        <note>
            Multiple explores plausibly answer this. Ask the user the
            suggestedQuestion. Do NOT call runQuery.
        </note>
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

const renderNoMatch = (
    result: Extract<DiscoverFieldsResult, { status: 'no_match' }>,
) => (
    <discovery status="no_match">
        <reason>{result.reason}</reason>
    </discovery>
);

const renderResult = (result: DiscoverFieldsResult): string => {
    switch (result.status) {
        case 'resolved':
            return renderResolved(result).toString();
        case 'ambiguous':
            return renderAmbiguous(result).toString();
        case 'no_match':
            return renderNoMatch(result).toString();
        default:
            return '';
    }
};

/**
 * Locate the subagent's final `submitResult` tool call in the accumulated
 * UIMessage and parse its input through the result schema. AI SDK has
 * already validated the input against the same schema before invoking
 * the tool, so this `safeParse` is defence-in-depth — but we keep it
 * because the input is `unknown` at this point in the type system and
 * we'd rather surface a schema error than cast.
 */
const extractHandoffFromSubmitResult = (
    message: UIMessage | undefined,
): DiscoverFieldsResult | { error: string } => {
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
    const parsed = discoverFieldsResultSchema.safeParse(submitPart.input);
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
    promptUuid: string;
    telemetry: Pick<
        AiAgentArgs,
        'agentSettings' | 'threadUuid' | 'promptUuid' | 'telemetryEnabled'
    >;
};

/**
 * Schema enforcement is structural, not prompt-based: the subagent's final
 * step is a `submitResult` tool call whose `inputSchema` is the result
 * union. AI SDK validates the args at the tool-call boundary, so the
 * handoff arrives already-typed — no JSON.parse, no fence stripping,
 * no post-stream coercion.
 *
 * Each iteration of `readUIMessageStream` yields the accumulated subagent
 * UIMessage as `metadata.streamingMessage` on the streaming tool output;
 * AI SDK forwards each as a preliminary `tool-result` chunk so the
 * frontend can render the trace live. The final yield extracts the
 * handoff from the submitResult tool call and renders the XML the parent
 * model sees via `toModelOutput`. Subagent's `storeToolCall` writes are
 * awaited before the final yield so the parent's tool-result row never
 * commits before the children rows.
 */
export const getDiscoverFields = (args: ToolArgs, dependencies: Dependencies) =>
    tool({
        description: DISCOVER_FIELDS_DESCRIPTION,
        inputSchema: discoverFieldsInputSchema,
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
                        promptUuid: args.promptUuid,
                        parentToolCallId: toolCallId,
                        telemetry: args.telemetry,
                        abortSignal,
                    },
                    dependencies,
                );

                let currentMessage: UIMessage | undefined;
                for await (const message of readUIMessageStream({
                    stream: stream.toUIMessageStream(),
                })) {
                    currentMessage = message;
                    yield {
                        result: '',
                        metadata: {
                            status: 'streaming' as const,
                            streamingMessage: message,
                        },
                    };
                }

                await flushPersistence();

                const handoff = extractHandoffFromSubmitResult(currentMessage);
                if ('error' in handoff) {
                    yield {
                        result: toolErrorHandler(
                            new Error(handoff.error),
                            'Error discovering fields.',
                        ),
                        metadata: { status: 'error' as const },
                    };
                    return;
                }

                yield {
                    result: renderResult(handoff),
                    metadata: {
                        status: 'success' as const,
                        discovery: handoff,
                        streamingMessage: currentMessage,
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

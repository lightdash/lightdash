import {
    assertUnreachable,
    discoverFieldsToolDefinition,
    type Explore,
} from '@lightdash/common';
import {
    isToolUIPart,
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
import { hydrateDiscoverFieldsSelection } from './hydrateResult';
import type {
    DiscoverFieldsResult,
    DiscoverFieldsSelectionResult,
    ToolDiscoverFieldsOutput,
} from './schema';

const discoverFieldsTool = discoverFieldsToolDefinition.for('agent');

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
                    {result.explore.joinedTables.map((table) => (
                        <table>{table}</table>
                    ))}
                </joinedTables>
            )}
            {result.explore.requiredFilters &&
                result.explore.requiredFilters.length > 0 && (
                    <requiredFilters
                        count={result.explore.requiredFilters.length}
                    >
                        {result.explore.requiredFilters.map((filter) => (
                            <filter
                                fieldId={filter.fieldId}
                                fieldRef={filter.fieldRef}
                                tableName={filter.tableName}
                                operator={filter.operator}
                                values={JSON.stringify(filter.values ?? [])}
                                settings={
                                    filter.settings
                                        ? JSON.stringify(filter.settings)
                                        : undefined
                                }
                                required={filter.required}
                            />
                        ))}
                    </requiredFilters>
                )}
        </explore>
        <fields count={result.fields.length}>
            {result.fields.map((field) => (
                <field
                    fieldId={field.fieldId}
                    name={field.name}
                    label={field.label}
                    table={field.table}
                    type={field.fieldType}
                    fieldValueType={field.fieldValueType}
                    fieldFilterType={field.fieldFilterType}
                    isFromJoinedTable={field.isFromJoinedTable}
                    {...(field.caseSensitiveFilters === 'not_applicable'
                        ? {}
                        : {
                              caseSensitiveFilters:
                                  field.caseSensitiveFilters === 'true',
                          })}
                >
                    {field.description ? (
                        <description>{field.description}</description>
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
            suggestedQuestion. Do NOT call generateVisualization.
        </note>
        <candidates>
            {result.candidates.map((candidate) => (
                <candidate
                    name={candidate.exploreName}
                    label={candidate.exploreLabel}
                >
                    {candidate.reason}
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
            return assertUnreachable(
                result,
                'Unknown discover fields result status',
            );
    }
};

const getToolTraceSignature = (message: UIMessage): string =>
    message.parts
        .filter(isToolUIPart)
        .map((part) => `${part.type}:${part.toolCallId}:${part.state}`)
        .join('|');

const toStreamingOutput = (message: UIMessage): ToolDiscoverFieldsOutput => ({
    result: '',
    metadata: {
        status: 'streaming',
        streamingMessage: message,
    },
});

const toSuccessOutput = ({
    discovery,
    streamingMessage,
}: {
    discovery: DiscoverFieldsResult;
    streamingMessage: UIMessage | undefined;
}): ToolDiscoverFieldsOutput => ({
    result: renderResult(discovery),
    metadata: {
        status: 'success',
        discovery,
        ...(streamingMessage ? { streamingMessage } : {}),
    },
});

const toErrorOutput = (result: string): ToolDiscoverFieldsOutput => ({
    result,
    metadata: { status: 'error' },
});

type SelectionResult =
    | { status: 'success'; data: DiscoverFieldsSelectionResult }
    | { status: 'error'; error: unknown };

const waitForSelectionResult = async (
    selectionResult: PromiseLike<DiscoverFieldsSelectionResult>,
): Promise<SelectionResult> => {
    try {
        return { status: 'success', data: await selectionResult };
    } catch (error) {
        return { status: 'error', error };
    }
};

type Dependencies = DiscoverFieldsAgentDependencies;

type ToolArgs = {
    model: LanguageModel;
    callOptions: CallSettings;
    providerOptions: AiAgentArgs['providerOptions'];
    availableExplores: Explore[];
    findExploresFieldSearchSize: number;
    findFieldsPageSize: number;
    toolDescriptionMaxChars: number;
    promptUuid: string;
    telemetry: Pick<
        AiAgentArgs,
        | 'agentSettings'
        | 'threadUuid'
        | 'promptUuid'
        | 'organizationId'
        | 'userId'
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
                        findExploresFieldSearchSize:
                            args.findExploresFieldSearchSize,
                        findFieldsPageSize: args.findFieldsPageSize,
                        toolDescriptionMaxChars: args.toolDescriptionMaxChars,
                        promptUuid: args.promptUuid,
                        parentToolCallId: toolCallId,
                        telemetry: args.telemetry,
                        abortSignal,
                    },
                    dependencies,
                );
                const selectionResultPromise = waitForSelectionResult(
                    stream.output,
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
                        yield toStreamingOutput(message);
                    }
                }

                await flushPersistence();

                const selectionResult = await selectionResultPromise;
                if (selectionResult.status === 'error') {
                    yield toErrorOutput(
                        toolErrorHandler(
                            selectionResult.error,
                            'Error discovering fields.',
                            { captureToSentry: false },
                        ),
                    );
                    return;
                }

                const hydrated = await hydrateDiscoverFieldsSelection({
                    selection: selectionResult.data.handoff,
                    availableExplores: args.availableExplores,
                    getExplore: dependencies.getExplore,
                    toolDescriptionMaxChars: args.toolDescriptionMaxChars,
                });
                if (hydrated.status === 'error') {
                    yield toErrorOutput(
                        toolErrorHandler(
                            new Error(hydrated.error),
                            'Error discovering fields.',
                            { captureToSentry: false },
                        ),
                    );
                    return;
                }

                yield toSuccessOutput({
                    discovery: hydrated.discovery,
                    streamingMessage: currentMessage,
                });
            } catch (error) {
                yield toErrorOutput(
                    toolErrorHandler(error, 'Error discovering fields.'),
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

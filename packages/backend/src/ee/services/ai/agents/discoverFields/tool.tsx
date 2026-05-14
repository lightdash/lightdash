import { Explore } from '@lightdash/common';
import { tool, type CallSettings, type LanguageModel } from 'ai';
import type { AiAgentArgs } from '../../types/aiAgent';
import { toModelOutput } from '../../utils/toModelOutput';
import { toolErrorHandler } from '../../utils/toolErrorHandler';
import { xmlBuilder } from '../../xmlBuilder';
import {
    runDiscoverFieldsAgent,
    type DiscoverFieldsAgentDependencies,
} from './agent';
import { discoverFieldsInputSchema, type DiscoverFieldsResult } from './schema';

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
            // exhaustiveness — should never reach here
            return '';
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
    promptUuid: string;
    telemetry: Pick<
        AiAgentArgs,
        'agentSettings' | 'threadUuid' | 'promptUuid' | 'telemetryEnabled'
    >;
};

export const getDiscoverFields = (args: ToolArgs, dependencies: Dependencies) =>
    tool({
        description: DISCOVER_FIELDS_DESCRIPTION,
        inputSchema: discoverFieldsInputSchema,
        execute: async (input, { toolCallId }) => {
            try {
                const { handoff, trace } = await runDiscoverFieldsAgent(
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
                    },
                    dependencies,
                );

                return {
                    result: renderResult(handoff),
                    metadata: {
                        status: 'success' as const,
                        discovery: handoff,
                        trace,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error discovering fields.',
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

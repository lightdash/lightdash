import {
    CatalogField,
    CompiledDimension,
    CompiledMetric,
    convertToAiHints,
    Explore,
    ExploreAmbiguityError,
    getItemId,
    toolFindExploresArgsSchemaV3,
    toolFindExploresOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindExploresFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { validateExploreNameExists } from '../utils/validators';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    fieldSearchSize: number;
    findExplores: FindExploresFn;
    updateProgress: UpdateProgressFn;
};

function getCatalogChartUsage(
    catalogFields: { dimensions: CatalogField[]; metrics: CatalogField[] },
    type: 'dimension',
    field: CompiledDimension,
): number;
function getCatalogChartUsage(
    catalogFields: { dimensions: CatalogField[]; metrics: CatalogField[] },
    type: 'metric',
    field: CompiledMetric,
): number;
function getCatalogChartUsage(
    catalogFields: { dimensions: CatalogField[]; metrics: CatalogField[] },
    type: 'dimension' | 'metric',
    field: CompiledDimension | CompiledMetric,
) {
    const catalogField = catalogFields[
        type === 'dimension' ? 'dimensions' : 'metrics'
    ].find((f) => f.name === field.name);
    return catalogField?.chartUsage ?? 0;
}

const generateExploreResponse = ({
    explore,
    catalogFields,
}: Awaited<ReturnType<FindExploresFn>>) => {
    const baseTable = explore.tables[explore.baseTable];
    const aiHints = baseTable.aiHint
        ? convertToAiHints(baseTable.aiHint)
        : null;

    return (
        <explore tableName={explore.name}>
            <label>{explore.label}</label>
            <basetable alt="ID of the base table">{baseTable.name}</basetable>
            {aiHints && aiHints.length > 0 && (
                <aihints>
                    {aiHints.map((hint: string) => (
                        <hint>{hint}</hint>
                    ))}
                </aihints>
            )}
            {baseTable.description && (
                <description alt="Description of the base table">
                    {baseTable.description}
                </description>
            )}
            {explore.joinedTables && explore.joinedTables.length > 0 && (
                <joinedtables
                    alt="IDs of the joined tables"
                    totalCount={explore.joinedTables.length}
                >
                    {explore.joinedTables.map((joinedTable) => (
                        <tablename>{joinedTable.table}</tablename>
                    ))}
                </joinedtables>
            )}

            {Object.values(explore.tables).length > 0 &&
                Object.values(explore.tables).map((table) => (
                    <table
                        name={table.name}
                        isBaseTable={table.name === explore.baseTable}
                    >
                        <fields alt="dimensions and metrics">
                            {Object.values(table.dimensions).length > 0 && (
                                <dimensions alt="dimensions">
                                    {Object.values(table.dimensions)
                                        .filter(
                                            (d) =>
                                                !d.hidden && !d.isIntervalBase,
                                        )
                                        .map((dimension) => (
                                            <dimension
                                                usageInCharts={getCatalogChartUsage(
                                                    catalogFields,
                                                    'dimension',
                                                    dimension,
                                                )}
                                                name={dimension.name}
                                                label={dimension.label}
                                                fieldId={getItemId(dimension)}
                                            >
                                                {dimension.aiHint &&
                                                    (
                                                        convertToAiHints(
                                                            dimension.aiHint,
                                                        ) ?? []
                                                    ).length > 0 && (
                                                        <aihints>
                                                            {dimension.aiHint &&
                                                                convertToAiHints(
                                                                    dimension.aiHint,
                                                                )?.map(
                                                                    (hint) => (
                                                                        <hint>
                                                                            {
                                                                                hint
                                                                            }
                                                                        </hint>
                                                                    ),
                                                                )}
                                                        </aihints>
                                                    )}
                                            </dimension>
                                        ))}
                                </dimensions>
                            )}

                            {Object.values(table.metrics).length > 0 && (
                                <metrics alt="metrics">
                                    {Object.values(table.metrics)
                                        .filter((m) => !m.hidden)
                                        .map((metric) => (
                                            <metric
                                                usageInCharts={getCatalogChartUsage(
                                                    catalogFields,
                                                    'metric',
                                                    metric,
                                                )}
                                                name={metric.name}
                                                label={metric.label}
                                                fieldId={getItemId(metric)}
                                            >
                                                {metric.aiHint &&
                                                    (
                                                        convertToAiHints(
                                                            metric.aiHint,
                                                        ) ?? []
                                                    ).length > 0 && (
                                                        <aihints>
                                                            {metric.aiHint &&
                                                                convertToAiHints(
                                                                    metric.aiHint,
                                                                )?.map(
                                                                    (hint) => (
                                                                        <hint>
                                                                            {
                                                                                hint
                                                                            }
                                                                        </hint>
                                                                    ),
                                                                )}
                                                        </aihints>
                                                    )}
                                            </metric>
                                        ))}
                                </metrics>
                            )}
                        </fields>
                    </table>
                ))}
        </explore>
    );
};
export const getFindExplores = ({
    findExplores,
    updateProgress,
    fieldSearchSize,
}: Dependencies) =>
    tool({
        description: toolFindExploresArgsSchemaV3.description,
        inputSchema: toolFindExploresArgsSchemaV3,
        outputSchema: toolFindExploresOutputSchema,
        execute: async (args, { experimental_context: context }) => {
            try {
                await updateProgress(
                    `🔍 Searching explore: \`${args.exploreName}\`...`,
                );

                const ctx = AgentContext.from(context);

                if (!args.searchQuery) {
                    validateExploreNameExists(
                        ctx.getAvailableExplores(),
                        args.exploreName,
                    );
                }

                const { explore, catalogFields } = await findExplores({
                    exploreName: args.exploreName,
                    fieldSearchSize,
                    searchQuery: args.searchQuery,
                });

                return {
                    result: generateExploreResponse({
                        explore,
                        catalogFields,
                    }).toString(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                // Handle ambiguity error specially - provide formatted candidate list
                if (error instanceof ExploreAmbiguityError) {
                    const candidatesList = error.candidates
                        .map(
                            (c, i) =>
                                `${i + 1}. **${c.label}** (\`${c.name}\`)\n   ${
                                    c.description || 'No description'
                                }\n    ${c.aiHints?.join(
                                    ', ',
                                )}\n    Relevance: ${
                                    c.searchRank?.toFixed(3) ?? 'N/A'
                                }`,
                        )
                        .join('\n\n');

                    return {
                        result: `Multiple explores match your query. Please ask the user to clarify which one they mean:\n\n${candidatesList}\n\nAsk the user: "Which dataset would you like to use?"`,
                        metadata: {
                            status: 'error',
                            errorType: 'ambiguity',
                            candidates: error.candidates,
                        },
                    };
                }

                return {
                    result: toolErrorHandler(error, `Error listing explores.`),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });

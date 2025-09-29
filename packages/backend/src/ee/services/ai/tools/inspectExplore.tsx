import { getItemId, toolInspectExploreArgsSchema } from '@lightdash/common';
import { tool } from 'ai';
import type { InspectExploreFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    inspectExploreFieldsPageSize: number;
    inspectExplore: InspectExploreFn;
};

export const getInspectExplore = ({
    inspectExplore,
    inspectExploreFieldsPageSize,
}: Dependencies) =>
    tool({
        description: toolInspectExploreArgsSchema.description,
        inputSchema: toolInspectExploreArgsSchema,
        execute: async (args) => {
            try {
                if (args.page && args.page < 1) {
                    return `Error: Page must be greater than 0.`;
                }

                const {
                    table,
                    dimensions,
                    metrics,
                    dimensionsPagination,
                    metricsPagination,
                } = await inspectExplore({
                    tableName: args.exploreName,
                    page: args.page ?? 1,
                    pageSize: inspectExploreFieldsPageSize,
                });

                return (
                    <explore tableName={table.name}>
                        <label>{table.label}</label>
                        <basetable alt="ID of the base table">
                            {table.name}
                        </basetable>
                        {table.aiHints && table.aiHints.length > 0 && (
                            <aihints>
                                {table.aiHints.map((hint: string) => (
                                    <hint>{hint}</hint>
                                ))}
                            </aihints>
                        )}
                        <description alt="Description of the base table">
                            {table.description}
                        </description>
                        {table.joinedTables &&
                            table.joinedTables.length > 0 && (
                                <joinedtables
                                    alt="IDs of the joined tables"
                                    totalCount={table.joinedTables.length}
                                >
                                    {table.joinedTables.map(
                                        (joinedTable: string) => (
                                            <tablename>{joinedTable}</tablename>
                                        ),
                                    )}
                                </joinedtables>
                            )}
                        {dimensions &&
                            metrics &&
                            dimensions.length > 0 &&
                            metrics.length > 0 && (
                                <fields
                                    alt="most popular dimensions and metrics"
                                    totalCount={
                                        (dimensionsPagination?.totalResults ??
                                            0) +
                                        (metricsPagination?.totalResults ?? 0)
                                    }
                                    displayedResults={
                                        dimensions.length + metrics.length
                                    }
                                >
                                    <dimensions
                                        alt="most popular dimensions"
                                        totalResults={
                                            dimensionsPagination?.totalResults ??
                                            0
                                        }
                                        displayedResults={dimensions.length}
                                    >
                                        {dimensions.map((d) => (
                                            <dimension
                                                table={d.tableName}
                                                name={d.name}
                                                fieldId={getItemId({
                                                    name: d.name,
                                                    table: d.tableName,
                                                })}
                                            >
                                                {d.label}
                                            </dimension>
                                        ))}
                                    </dimensions>
                                    <metrics
                                        alt="most popular metrics"
                                        totalResults={
                                            metricsPagination?.totalResults ?? 0
                                        }
                                        displayedResults={metrics.length}
                                    >
                                        {metrics.map((m) => (
                                            <metric
                                                table={m.tableName}
                                                name={m.name}
                                                fieldId={getItemId({
                                                    name: m.name,
                                                    table: m.tableName,
                                                })}
                                            >
                                                {m.label}
                                            </metric>
                                        ))}
                                    </metrics>
                                </fields>
                            )}
                    </explore>
                );
            } catch (error) {
                return toolErrorHandler(error, `Error listing explores.`);
            }
        },
    });

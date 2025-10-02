import {
    getItemId,
    toolFindExploresArgsSchema,
    toolFindExploresOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { truncate } from 'lodash';
import type { FindExploresFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    pageSize: number;
    fieldSearchSize: number;
    fieldOverviewSearchSize: number;
    maxDescriptionLength: number;
    findExplores: FindExploresFn;
};

const generateExploreResponse = ({
    table,
    dimensions,
    metrics,
    dimensionsPagination,
    metricsPagination,
    shouldTruncate,
    maxDescriptionLength,
}: Awaited<ReturnType<FindExploresFn>>['tablesWithFields'][number] & {
    shouldTruncate: boolean;
    maxDescriptionLength: number;
}) => {
    const description = shouldTruncate
        ? truncate(table.description || '', {
              length: maxDescriptionLength,
              omission: '...(truncated)',
          })
        : table.description || '';

    return (
        <explore tableName={table.name}>
            <label>{table.label}</label>
            <basetable alt="ID of the base table">{table.name}</basetable>
            {table.aiHints && table.aiHints.length > 0 && (
                <aihints>
                    {table.aiHints.map((hint: string) => (
                        <hint>{hint}</hint>
                    ))}
                </aihints>
            )}
            <description alt="Description of the base table">
                {description}
            </description>
            {table.joinedTables && table.joinedTables.length > 0 && (
                <joinedtables
                    alt="IDs of the joined tables"
                    totalCount={table.joinedTables.length}
                >
                    {table.joinedTables.map((joinedTable: string) => (
                        <tablename>{joinedTable}</tablename>
                    ))}
                </joinedtables>
            )}
            {dimensions &&
                metrics &&
                dimensions.length > 0 &&
                metrics.length > 0 && (
                    <fields
                        alt="most popular dimensions and metrics"
                        totalCount={
                            (dimensionsPagination?.totalResults ?? 0) +
                            (metricsPagination?.totalResults ?? 0)
                        }
                        displayedResults={dimensions.length + metrics.length}
                    >
                        <dimensions
                            alt="most popular dimensions"
                            totalResults={
                                dimensionsPagination?.totalResults ?? 0
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
                            totalResults={metricsPagination?.totalResults ?? 0}
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
};

export const getFindExplores = ({
    findExplores,
    pageSize,
    maxDescriptionLength,
    fieldSearchSize,
    fieldOverviewSearchSize,
}: Dependencies) =>
    tool({
        description: toolFindExploresArgsSchema.description,
        inputSchema: toolFindExploresArgsSchema,
        outputSchema: toolFindExploresOutputSchema,
        execute: async (args) => {
            try {
                if (args.page && args.page < 1) {
                    return {
                        result: `Error: Page must be greater than 0.`,
                        metadata: {
                            status: 'error',
                        },
                    };
                }

                const { pagination, tablesWithFields } = await findExplores({
                    tableName: args.exploreName,
                    page: args.page ?? 1,
                    pageSize,
                    includeFields: !!args.exploreName,
                    fieldSearchSize,
                    fieldOverviewSearchSize,
                });

                const exploreElements = tablesWithFields.map(
                    (tableWithFields) =>
                        generateExploreResponse({
                            ...tableWithFields,
                            shouldTruncate: !args.exploreName,
                            maxDescriptionLength,
                        }),
                );

                if (args.exploreName) {
                    return {
                        result: (
                            <explores>{exploreElements}</explores>
                        ) as string,
                        metadata: {
                            status: 'success',
                        },
                    };
                }

                return {
                    result: (
                        <explores
                            page={pagination?.page ?? 0}
                            pageSize={pagination?.pageSize ?? 0}
                            totalPageCount={pagination?.totalPageCount ?? 0}
                            totalResults={pagination?.totalResults ?? 0}
                        >
                            {exploreElements}
                        </explores>
                    ) as string,
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
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

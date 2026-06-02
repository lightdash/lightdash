import { searchSemanticLayerToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type {
    SearchSemanticLayerFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { FIELD_DESCRIPTION_MAX_CHARS, truncate } from '../utils/truncation';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    searchSemanticLayer: SearchSemanticLayerFn;
    updateProgress: UpdateProgressFn;
    pageSize: number;
};

const toolDefinition = searchSemanticLayerToolDefinition.for('agent');

const generateResponse = ({
    fields,
    pagination,
}: Awaited<ReturnType<SearchSemanticLayerFn>>) => (
    <semanticLayerFields
        page={pagination?.page}
        pageSize={pagination?.pageSize}
        totalPageCount={pagination?.totalPageCount}
        totalResults={pagination?.totalResults}
    >
        <note>
            These fields are drawn from across ALL explores in the project. Use
            this inventory to compare definitions and spot duplicate or
            confusingly similar metrics. If there are more pages, request the
            next page to see the rest. To inspect a single explore in depth, use
            findFields.
        </note>
        {fields.map((field) => (
            <field
                name={field.name}
                label={field.label}
                exploreName={field.tableName}
                fieldType={field.fieldType}
                usageInCharts={field.chartUsage ?? 0}
            >
                {field.description && (
                    <description>
                        {truncate(
                            field.description,
                            FIELD_DESCRIPTION_MAX_CHARS,
                        )}
                    </description>
                )}
            </field>
        ))}
    </semanticLayerFields>
);

export const getSearchSemanticLayer = ({
    searchSemanticLayer,
    updateProgress,
    pageSize,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const hasQuery = !!args.searchQuery?.trim();
                await updateProgress(
                    hasQuery
                        ? `Searching the semantic layer for "${args.searchQuery}"...`
                        : 'Listing metrics and dimensions across the semantic layer...',
                );

                const { fields, pagination } = await searchSemanticLayer({
                    searchQuery: args.searchQuery,
                    type: args.type,
                    page: args.page ?? 1,
                    pageSize,
                });

                return {
                    result: generateResponse({ fields, pagination }).toString(),
                    metadata: {
                        status: 'success',
                        ranking: {
                            searchQuery: args.searchQuery,
                            type: args.type,
                            fields: fields.map((field) => ({
                                name: field.name,
                                label: field.label,
                                tableName: field.tableName,
                                fieldType: field.fieldType,
                                searchRank: field.searchRank,
                                chartUsage: field.chartUsage,
                            })),
                        },
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error searching the semantic layer.`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

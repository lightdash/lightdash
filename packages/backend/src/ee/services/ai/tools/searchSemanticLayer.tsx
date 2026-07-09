import { searchSemanticLayerToolDefinition } from '@lightdash/common';
import type {
    SearchSemanticLayerFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { truncate } from '../utils/truncation';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    searchSemanticLayer: SearchSemanticLayerFn;
    updateProgress: UpdateProgressFn;
    /** Upper bound for the agent-supplied pageSize; also the fallback default. */
    maxPageSize: number;
    toolDescriptionMaxChars: number;
};

/** Used when the agent does not specify a pageSize. */
const DEFAULT_PAGE_SIZE = 200;

const toolDefinition = searchSemanticLayerToolDefinition.for('ai-sdk');

const generateResponse = ({
    fields,
    pagination,
    toolDescriptionMaxChars,
}: Awaited<ReturnType<SearchSemanticLayerFn>> & {
    toolDescriptionMaxChars: number;
}) => (
    <semanticLayerFields
        page={pagination?.page}
        pageSize={pagination?.pageSize}
        totalPageCount={pagination?.totalPageCount}
        totalResults={pagination?.totalResults}
    >
        <note>
            These fields are drawn from across ALL explores in the project. Use
            this inventory to compare definitions and spot duplicate or
            confusingly similar metrics. For a high-level overview, this first
            page plus the totals above is usually enough — only page through the
            rest when you genuinely need every field (e.g. a project-wide
            duplicate/inconsistency audit). To inspect a single explore in
            depth, use findFields.
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
                        {truncate(field.description, toolDescriptionMaxChars)}
                    </description>
                )}
            </field>
        ))}
    </semanticLayerFields>
);

export const getSearchSemanticLayer = ({
    searchSemanticLayer,
    updateProgress,
    maxPageSize,
    toolDescriptionMaxChars,
}: Dependencies) =>
    toolDefinition.build({
        execute: async (args) => {
            try {
                const hasQuery = !!args.searchQuery?.trim();
                await updateProgress(
                    hasQuery
                        ? `Searching the semantic layer for "${args.searchQuery}"...`
                        : 'Listing metrics and dimensions across the semantic layer...',
                );

                // The agent picks the page size to fit the task; clamp to the
                // server max so a single call can't pull an unbounded payload.
                const pageSize = Math.min(
                    args.pageSize ?? DEFAULT_PAGE_SIZE,
                    maxPageSize,
                );
                const { fields, pagination } = await searchSemanticLayer({
                    searchQuery: args.searchQuery,
                    type: args.type,
                    page: args.page ?? 1,
                    pageSize,
                });

                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: generateResponse({
                        fields,
                        pagination,
                        toolDescriptionMaxChars,
                    }).toString(),
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
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        `Error searching the semantic layer.`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
    });

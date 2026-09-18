import {
    searchSemanticLayerToolDefinition,
    type ToolSearchSemanticLayerOutput,
    type ToolSearchSemanticLayerStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    SearchSemanticLayerFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
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

const toolDefinition = searchSemanticLayerToolDefinition.for('agent');

const buildStructuredContent = ({
    fields,
    pagination,
    toolDescriptionMaxChars,
}: Awaited<ReturnType<SearchSemanticLayerFn>> & {
    toolDescriptionMaxChars: number;
}): ToolSearchSemanticLayerStructuredContent => ({
    pagination: pagination
        ? {
              page: pagination.page,
              pageSize: pagination.pageSize,
              totalPageCount: pagination.totalPageCount,
              totalResults: pagination.totalResults,
          }
        : null,
    fields: fields.map((field) => ({
        name: field.name,
        label: field.label,
        exploreName: field.tableName,
        fieldType: field.fieldType,
        usageInCharts: field.chartUsage ?? 0,
        description: field.description
            ? truncate(field.description, toolDescriptionMaxChars)
            : null,
    })),
});

const generateResponse = ({
    fields,
    pagination,
}: ToolSearchSemanticLayerStructuredContent) => (
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
                exploreName={field.exploreName}
                fieldType={field.fieldType}
                usageInCharts={field.usageInCharts}
            >
                {field.description !== null && (
                    <description>{field.description}</description>
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
    tool({
        ...toolDefinition,
        execute: async (args): Promise<ToolSearchSemanticLayerOutput> => {
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

                const structuredContent = buildStructuredContent({
                    fields,
                    pagination,
                    toolDescriptionMaxChars,
                });

                return {
                    result: generateResponse(structuredContent).toString(),
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
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    `Error searching the semantic layer.`,
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

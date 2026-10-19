import {
    findCustomChartTypesToolDefinition,
    serializeCustomChartTypeSchema,
    type CustomChartType,
    type ToolFindCustomChartTypesArgs,
    type ToolFindCustomChartTypesStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindCustomChartTypesFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import {
    type ExecuteStructuredToolResult,
    type ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { formatToolJsonOutput } from './toolOutputFormat';

type Dependencies = {
    findCustomChartTypes: FindCustomChartTypesFn;
    updateProgress: UpdateProgressFn;
};

const toolDefinition = findCustomChartTypesToolDefinition.for('agent');

// The args schema keeps both fields nullish (LLM tool inputs are flat
// objects); exactly-one is enforced here with a retryable tool error.
export const parseFindCustomChartTypesArgs = (
    args: ToolFindCustomChartTypesArgs,
): { query: string } | { slug: string } | null => {
    const query = args.query?.trim() || null;
    const slug = args.slug?.trim() || null;
    if (query !== null && slug === null) return { query };
    if (slug !== null && query === null) return { slug };
    return null;
};

export const buildFindCustomChartTypesStructuredContent = (
    request: { query: string } | { slug: string },
    matches: CustomChartType[],
): ToolFindCustomChartTypesStructuredContent => {
    const note = (() => {
        if (matches.length === 0) {
            return 'slug' in request
                ? `No custom chart type with slug "${request.slug}" exists in this project. Search by query to discover the available slugs.`
                : 'No custom chart type matched your query. Try different terms, or fetch a specific type by slug.';
        }
        return 'Bind the required field slots to fields from your query when rendering through a type; the slug identifies the type.';
    })();

    return {
        request,
        matches: {
            count: matches.length,
            note,
            results: matches.map((match) => ({
                slug: match.slug,
                name: match.name,
                description: match.description,
                schema: serializeCustomChartTypeSchema(match),
            })),
        },
    };
};

export const getFindCustomChartTypes = ({
    findCustomChartTypes,
    updateProgress,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            args,
        ): Promise<
            | ExecuteStructuredToolResult<ToolFindCustomChartTypesStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const request = parseFindCustomChartTypesArgs(args);
                if (request === null) {
                    const result =
                        'Set exactly one of `query` (keyword search) or `slug` (exact fetch), not both and not neither.';
                    return {
                        result,
                        metadata: { status: 'error' },
                        structuredContent: { error: result },
                    };
                }
                await updateProgress(
                    'query' in request
                        ? `Searching custom chart types matching "${request.query}"...`
                        : `Fetching custom chart type "${request.slug}"...`,
                );

                const matches = await findCustomChartTypes(request);
                const structuredContent =
                    buildFindCustomChartTypesStructuredContent(
                        request,
                        matches,
                    );
                return {
                    result: formatToolJsonOutput(structuredContent),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error finding custom chart types.',
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

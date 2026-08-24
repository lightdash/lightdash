import {
    findCustomChartTypesToolDefinition,
    serializeCustomChartTypeSchema,
    type CustomChartType,
    type ToolFindCustomChartTypesArgs,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindCustomChartTypesFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
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
) => {
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
        execute: async (args) => {
            try {
                const request = parseFindCustomChartTypesArgs(args);
                if (request === null) {
                    return {
                        result: 'Set exactly one of `query` (keyword search) or `slug` (exact fetch), not both and not neither.',
                        metadata: { status: 'error' as const },
                    };
                }
                await updateProgress(
                    'query' in request
                        ? `Searching custom chart types matching "${request.query}"...`
                        : `Fetching custom chart type "${request.slug}"...`,
                );

                const matches = await findCustomChartTypes(request);
                return {
                    result: formatToolJsonOutput(
                        buildFindCustomChartTypesStructuredContent(
                            request,
                            matches,
                        ),
                    ),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error finding custom chart types.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

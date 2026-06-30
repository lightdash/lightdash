import {
    searchFieldValuesToolDefinition,
    TimeoutError,
    toolSearchFieldValuesArgsSchemaTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    searchFieldValues: SearchFieldValuesFn;
};

const toolDefinition = searchFieldValuesToolDefinition.for('agent');

// Upper bound for a single field-values search. On high-cardinality fields the
// warehouse search can take minutes; chained slow calls bleed past the
// stream/connection timeout and surface to the user as a network error while
// the backend keeps working. Fail fast with a usable error instead.
export const SEARCH_FIELD_VALUES_TIMEOUT_MS = 15_000;

// Races a promise against a timeout. NOTE: this only stops *waiting* on the
// underlying call — a warehouse query started by `searchFieldValues` keeps
// running server-side. That is acceptable here: the goal is to unblock the
// agent turn, not to cancel the query.
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timer: NodeJS.Timeout;
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            timer = setTimeout(
                () =>
                    reject(
                        new TimeoutError(
                            `Search for field values timed out after ${timeoutMs}ms. Retry with a more specific (non-empty) query to narrow the results, or add filters.`,
                        ),
                    ),
                timeoutMs,
            );
        }),
    ]).finally(() => clearTimeout(timer));
};

export const getSearchFieldValues = ({ searchFieldValues }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (toolArgs) => {
            try {
                const args =
                    toolSearchFieldValuesArgsSchemaTransformed.parse(toolArgs);

                const results = await withTimeout(
                    searchFieldValues(args),
                    SEARCH_FIELD_VALUES_TIMEOUT_MS,
                );

                return {
                    result: serializeData(results, 'json'),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error searching field values.',
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

import {
    getItemId,
    getVisibleFields,
    listFieldsToolDefinition,
    type ToolListFieldsOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetExploreFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { fieldToJson, toRenderableField } from './fieldOutput';
import { stringifyToolJson } from './toolOutputFormat';

type Dependencies = {
    getExplore: GetExploreFn;
};

const toolDefinition = listFieldsToolDefinition.for('agent');

type FieldLookupRequest = {
    explore: string;
    fieldId: string;
};

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error';

const lookupFields = async ({
    getExplore,
    fields,
}: Dependencies & { fields: FieldLookupRequest[] }) => {
    const exploreCache = new Map<string, Awaited<ReturnType<GetExploreFn>>>();

    const getExploreCached = async (exploreName: string) => {
        const cached = exploreCache.get(exploreName);
        if (cached) {
            return cached;
        }
        const explore = await getExplore({ table: exploreName });
        exploreCache.set(exploreName, explore);
        return explore;
    };

    return Promise.all(
        fields.map(async (request) => {
            try {
                const explore = await getExploreCached(request.explore);
                const item = Object.fromEntries(
                    getVisibleFields(explore).map((field) => [
                        getItemId(field),
                        field,
                    ]),
                )[request.fieldId];

                if (!item) {
                    return {
                        status: 'error' as const,
                        request,
                        error: `Field "${request.fieldId}" was not found in explore "${request.explore}".`,
                    };
                }

                return {
                    status: 'success' as const,
                    request,
                    explore,
                    field: item,
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    request,
                    error: getErrorMessage(error),
                };
            }
        }),
    );
};

const getResponseNote = () =>
    'Exact field lookup results. Successful fields include full untruncated descriptions. Errors are scoped to each requested field.';

const getStructuredResponse = (
    results: Awaited<ReturnType<typeof lookupFields>>,
) => ({
    count: results.length,
    note: getResponseNote(),
    results: results.map((result) => {
        if (result.status === 'error') {
            return {
                status: result.status,
                explore: result.request.explore,
                fieldId: result.request.fieldId,
                error: result.error,
            };
        }

        return {
            status: result.status,
            explore: result.request.explore,
            fieldId: result.request.fieldId,
            field: fieldToJson({
                field: toRenderableField(result.field),
                explore: result.explore,
            }),
        };
    }),
});

export type ListFieldsStructuredResult = ReturnType<
    typeof getStructuredResponse
>;

export const getListFields = ({ getExplore }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const results = await lookupFields({
                    getExplore,
                    fields: args.fields,
                });

                const structuredResult = getStructuredResponse(results);

                return {
                    result: stringifyToolJson(structuredResult),
                    structuredResult,
                    metadata: {
                        status: 'success' as const,
                        lookup: {
                            fields: results.map((result) => ({
                                explore: result.request.explore,
                                fieldId: result.request.fieldId,
                                status: result.status,
                            })),
                        },
                    },
                } as ToolListFieldsOutput;
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error listing fields.'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

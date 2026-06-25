import {
    getFieldsToolDefinition,
    getItemMap,
    isField,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetExploreFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';
import { fieldToJson, renderField, toRenderableField } from './fieldOutput';
import { stringifyToolJson, type ToolOutputFormat } from './toolOutputFormat';

type Dependencies = {
    getExplore: GetExploreFn;
    outputFormat?: ToolOutputFormat;
};

const toolDefinition = getFieldsToolDefinition.for('agent');

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

    const results = await Promise.all(
        fields.map(async (request) => {
            try {
                const explore = await getExploreCached(request.explore);
                const item = getItemMap(explore)[request.fieldId];

                if (!item || !isField(item)) {
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

    return results;
};

const getResponseNote = () =>
    'Exact field lookup results. Successful fields include full untruncated descriptions. Errors are scoped to each requested field.';

const renderJsonResponse = (
    results: Awaited<ReturnType<typeof lookupFields>>,
) =>
    stringifyToolJson({
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
                    descriptionMode: 'full',
                }),
            };
        }),
    });

const renderXmlResponse = (
    results: Awaited<ReturnType<typeof lookupFields>>,
) => (
    <fields count={results.length}>
        <note>{getResponseNote()}</note>
        {results.map((result) => {
            if (result.status === 'error') {
                return (
                    <fieldError
                        explore={result.request.explore}
                        fieldId={result.request.fieldId}
                    >
                        {result.error}
                    </fieldError>
                );
            }

            return (
                <fieldResult
                    explore={result.request.explore}
                    fieldId={result.request.fieldId}
                >
                    {renderField({
                        field: toRenderableField(result.field),
                        explore: result.explore,
                        descriptionMode: 'full',
                    })}
                </fieldResult>
            );
        })}
    </fields>
);

export const getGetFields = ({
    getExplore,
    outputFormat = 'xml',
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (args) => {
            try {
                const results = await lookupFields({
                    getExplore,
                    fields: args.fields,
                });

                return {
                    result:
                        outputFormat === 'json'
                            ? renderJsonResponse(results)
                            : renderXmlResponse(results).toString(),
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
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error getting fields.'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

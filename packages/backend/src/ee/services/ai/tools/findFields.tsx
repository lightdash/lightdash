import {
    CatalogField,
    convertToAiHints,
    getFilterTypeFromItemType,
    getItemId,
    isEmojiIcon,
    toolFindFieldsArgsSchema,
    toolFindFieldsOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    FindFieldFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    findFields: FindFieldFn;
    updateProgress: UpdateProgressFn;
    pageSize: number;
};

const renderField = (catalogField: CatalogField) => {
    const aiHints = convertToAiHints(catalogField.aiHints ?? undefined);

    return (
        <field
            type={catalogField.fieldType}
            baseTable={catalogField.tableName}
            name={catalogField.name}
            fieldId={getItemId({
                name: catalogField.name,
                table: catalogField.tableName,
            })}
            fieldType={catalogField.fieldValueType}
            fieldFilterType={getFilterTypeFromItemType(
                catalogField.fieldValueType,
            )}
            searchRank={catalogField.searchRank}
            chartUsage={catalogField.chartUsage}
        >
            <label>{catalogField.label}</label>
            {aiHints && aiHints.length > 0 ? (
                <aihints>
                    {aiHints.map((hint) => (
                        <hint>{hint}</hint>
                    ))}
                </aihints>
            ) : null}
            <description>{catalogField.description}</description>
            {catalogField.categories && catalogField.categories.length > 0 ? (
                <categories>
                    {catalogField.categories.map((c) => (
                        <category>{c.name}</category>
                    ))}
                </categories>
            ) : null}
            {isEmojiIcon(catalogField.icon) ? (
                <emoji>{catalogField.icon.unicode}</emoji>
            ) : null}
        </field>
    );
};

const getFieldsText = (
    args: Awaited<ReturnType<FindFieldFn>> & { searchQuery: string },
) => (
    <searchresult
        searchQuery={args.searchQuery}
        page={args.pagination?.page}
        pageSize={args.pagination?.pageSize}
        totalPageCount={args.pagination?.totalPageCount}
        totalResults={args.pagination?.totalResults}
    >
        {args.fields.map((field) => renderField(field))}
    </searchresult>
);

export const getFindFields = ({
    findFields,
    updateProgress,
    pageSize,
}: Dependencies) =>
    tool({
        description: toolFindFieldsArgsSchema.description,
        inputSchema: toolFindFieldsArgsSchema,
        outputSchema: toolFindFieldsOutputSchema,
        execute: async (args) => {
            try {
                const searchLabels = args.fieldSearchQueries
                    .map((q) => `\`${q.label}\``)
                    .join(', ');
                await updateProgress(
                    `🔍 Searching for fields: ${searchLabels}${
                        args.table ? ` in \`${args.table}\`` : ''
                    }...`,
                );

                const fieldSearchQueryResults = await Promise.all(
                    args.fieldSearchQueries.map(async (fieldSearchQuery) => ({
                        searchQuery: fieldSearchQuery.label,
                        ...(await findFields({
                            table: args.table,
                            fieldSearchQuery,
                            page: args.page ?? 1,
                            pageSize,
                        })),
                    })),
                );

                const fieldsText = fieldSearchQueryResults
                    .map((fieldSearchQueryResult) =>
                        getFieldsText(fieldSearchQueryResult),
                    )
                    .join('\n\n');

                return {
                    result: (
                        <searchresults>{fieldsText}</searchresults>
                    ).toString(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error finding fields for search queries: ${args.fieldSearchQueries
                            .map((q) => q.label)
                            .join(', ')}`,
                    ),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });

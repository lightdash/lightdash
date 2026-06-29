import {
    convertFieldRefToFieldId,
    isJoinModelRequiredFilter,
    listExploresToolDefinition,
    type Explore,
    type McpToolListExploresOutput,
    type ModelRequiredFilterRule,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    stringifyToolJson,
    type StructuredToolResult,
} from './toolOutputFormat';

type Dependencies = {
    listExplores: () => Promise<Explore[]>;
};

const toolDefinition = listExploresToolDefinition.for('mcp');

const getRequiredFilterMetadata = (
    filter: ModelRequiredFilterRule,
    fallbackTableName: string,
) => {
    const tableName = isJoinModelRequiredFilter(filter)
        ? filter.target.tableName
        : fallbackTableName;

    return {
        fieldId: convertFieldRefToFieldId(filter.target.fieldRef, tableName),
        fieldRef: filter.target.fieldRef,
        tableName,
        operator: filter.operator,
        values: filter.values,
        settings: filter.settings,
        required: filter.required ?? true,
    };
};

const getExploreStructuredResponse = (explore: Explore) => {
    const requiredFilters =
        explore.tables[explore.baseTable].requiredFilters ?? [];

    return {
        name: explore.name,
        label: explore.label,
        baseTable: explore.baseTable,
        tags: explore.tags ?? [],
        joinedTables: explore.joinedTables.map(
            (joinedTable) => joinedTable.table,
        ),
        requiredFilters: requiredFilters.map((filter) =>
            getRequiredFilterMetadata(filter, explore.baseTable),
        ),
    };
};

const getStructuredResponse = (explores: Explore[]) => ({
    count: explores.length,
    explores: explores.map((explore) => getExploreStructuredResponse(explore)),
});

export type ListExploresStructuredResult = ReturnType<
    typeof getStructuredResponse
>;

type ListExploresSuccessOutput = McpToolListExploresOutput &
    StructuredToolResult<ListExploresStructuredResult>;

type ListExploresErrorOutput = McpToolListExploresOutput;

export type ListExploresOutput =
    | ListExploresSuccessOutput
    | ListExploresErrorOutput;

export const getListExplores = ({ listExplores }: Dependencies) =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
        execute: async (): Promise<ListExploresOutput> => {
            try {
                const explores = await listExplores();
                const structuredResult = getStructuredResponse(explores);

                return {
                    result: stringifyToolJson(structuredResult),
                    structuredResult,
                    metadata: {
                        status: 'success',
                    },
                } satisfies ListExploresSuccessOutput;
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error listing explores'),
                    metadata: {
                        status: 'error',
                    },
                } satisfies ListExploresErrorOutput;
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

import {
    convertFieldRefToFieldId,
    Explore,
    isJoinModelRequiredFilter,
    listExploresToolDefinition,
    mcpToolListExploresOutputSchema,
    type ModelRequiredFilterRule,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

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

const renderExplore = (explore: Explore) => {
    const requiredFilters =
        explore.tables[explore.baseTable].requiredFilters ?? [];

    return (
        <explore
            name={explore.name}
            label={explore.label}
            baseTable={explore.baseTable}
        >
            {explore.tags && explore.tags.length > 0 && (
                <tags>
                    {explore.tags.map((tag) => (
                        <tag>{tag}</tag>
                    ))}
                </tags>
            )}
            <joinedTables count={explore.joinedTables.length}>
                {explore.joinedTables.map((joinedTable) => (
                    <table>{joinedTable.table}</table>
                ))}
            </joinedTables>
            {requiredFilters.length > 0 && (
                <requiredFilters count={requiredFilters.length}>
                    {requiredFilters.map((filter) => {
                        const metadata = getRequiredFilterMetadata(
                            filter,
                            explore.baseTable,
                        );

                        return (
                            <filter
                                fieldId={metadata.fieldId}
                                fieldRef={metadata.fieldRef}
                                tableName={metadata.tableName}
                                operator={metadata.operator}
                                values={JSON.stringify(metadata.values ?? [])}
                                settings={
                                    metadata.settings
                                        ? JSON.stringify(metadata.settings)
                                        : undefined
                                }
                                required={metadata.required}
                            />
                        );
                    })}
                </requiredFilters>
            )}
        </explore>
    );
};

export const getMcpListExplores = ({ listExplores }: Dependencies) =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
        execute: async () => {
            try {
                const explores = await listExplores();

                return {
                    result: (
                        <explores count={explores.length}>
                            {explores.map((explore) => renderExplore(explore))}
                        </explores>
                    ).toString(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error listing explores'),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

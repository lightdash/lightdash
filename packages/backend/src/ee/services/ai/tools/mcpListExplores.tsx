import {
    Explore,
    listExploresToolDefinition,
    mcpToolListExploresOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { getExploreRequiredFilters } from '../utils/requiredFilters';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listExplores: () => Promise<Explore[]>;
};

const toolDefinition = listExploresToolDefinition.for('mcp');

const renderExplore = (explore: Explore) => {
    const requiredFilters = getExploreRequiredFilters(explore);

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
                    {requiredFilters.map((filter) => (
                        <filter
                            fieldId={filter.fieldId}
                            fieldRef={filter.fieldRef}
                            tableName={filter.tableName}
                            operator={filter.operator}
                            values={JSON.stringify(filter.values ?? [])}
                            settings={
                                filter.settings
                                    ? JSON.stringify(filter.settings)
                                    : undefined
                            }
                            required={filter.required}
                        />
                    ))}
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

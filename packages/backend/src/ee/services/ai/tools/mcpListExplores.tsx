import {
    Explore,
    mcpToolListExploresArgsSchema,
    mcpToolListExploresOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listExplores: () => Promise<Explore[]>;
};

const renderExplore = (explore: Explore) => (
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
    </explore>
);

export const getMcpListExplores = ({ listExplores }: Dependencies) =>
    tool({
        description: mcpToolListExploresArgsSchema.description,
        inputSchema: mcpToolListExploresArgsSchema,
        outputSchema: mcpToolListExploresOutputSchema,
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
        toModelOutput: (output) => toModelOutput(output),
    });

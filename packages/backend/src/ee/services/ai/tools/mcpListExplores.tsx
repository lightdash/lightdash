import {
    Explore,
    listExploresToolDefinition,
    McpToolListExploresOutput,
    McpToolListExploresStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { getExploreRequiredFilters } from '../utils/requiredFilters';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { escapeXmlText, xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listExplores: () => Promise<Explore[]>;
};

const toolDefinition = listExploresToolDefinition.for('mcp');

type ExploreSummary = McpToolListExploresStructuredContent['explores'][number];

const toExploreSummary = (explore: Explore): ExploreSummary => {
    const requiredFilters = getExploreRequiredFilters(explore);

    return {
        name: explore.name,
        ...(explore.label != null ? { label: explore.label } : {}),
        baseTable: explore.baseTable,
        ...(explore.tags && explore.tags.length > 0
            ? { tags: explore.tags }
            : {}),
        joinedTables: {
            count: explore.joinedTables.length,
            tables: explore.joinedTables.map(
                (joinedTable) => joinedTable.table,
            ),
        },
        ...(requiredFilters.length > 0
            ? {
                  requiredFilters: {
                      count: requiredFilters.length,
                      filters: requiredFilters.map((filter) => ({
                          fieldId: filter.fieldId,
                          fieldRef: filter.fieldRef,
                          tableName: filter.tableName,
                          operator: filter.operator,
                          values: filter.values ?? [],
                          ...(filter.settings
                              ? { settings: filter.settings }
                              : {}),
                          required: filter.required,
                      })),
                  },
              }
            : {}),
    };
};

const renderExplore = (explore: ExploreSummary) => (
    <explore
        name={explore.name}
        label={explore.label}
        baseTable={explore.baseTable}
    >
        {explore.tags && explore.tags.length > 0 && (
            <tags>
                {explore.tags.map((tag) => (
                    <tag>{escapeXmlText(tag)}</tag>
                ))}
            </tags>
        )}
        <joinedTables count={explore.joinedTables.count}>
            {explore.joinedTables.tables.map((table) => (
                <table>{table}</table>
            ))}
        </joinedTables>
        {explore.requiredFilters && (
            <requiredFilters count={explore.requiredFilters.count}>
                {explore.requiredFilters.filters.map((filter) => (
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

export const getMcpListExplores = ({ listExplores }: Dependencies) =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
        execute: async (): Promise<McpToolListExploresOutput> => {
            try {
                const explores = await listExplores();
                const structuredContent: McpToolListExploresStructuredContent =
                    {
                        count: explores.length,
                        explores: explores.map(toExploreSummary),
                    };

                return {
                    result: (
                        <explores count={structuredContent.count}>
                            {structuredContent.explores.map(renderExplore)}
                        </explores>
                    ).toString(),
                    metadata: {
                        status: 'success',
                    },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error listing explores');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

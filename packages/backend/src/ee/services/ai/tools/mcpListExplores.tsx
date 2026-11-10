import {
    ApiSourceExplore,
    Explore,
    listExploresToolDefinition,
    LIVE_SOURCE_INTEGRATION_PROFILES,
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

/**
 * A live data source explore reads its integration's API at query time, so
 * external agents need its rules to build a query the API accepts.
 */
const renderLiveDataSource = (apiSource: ApiSourceExplore) => (
    <liveDataSource
        integration={
            LIVE_SOURCE_INTEGRATION_PROFILES[apiSource.integration].agentLabel
        }
        maxDimensions={apiSource.maxDimensions ?? undefined}
        maxMetrics={apiSource.maxMetrics ?? undefined}
        orFilters={apiSource.filterGroups.or}
        nestedFilters={apiSource.filterGroups.nested}
    >
        <rule>
            Each query calls the integration live and returns aggregated rows:
            metrics broken down by dimensions. Funnels, retention, user paths,
            table calculations, custom metrics, pivots, date zoom and underlying
            data are not available.
        </rule>
        {apiSource.dateRange && (
            <dateRange
                fieldId={apiSource.dateRange.fieldId}
                defaultDays={apiSource.dateRange.defaultDays}
            >
                {`Filter on this field for the period asked about. Without a filter, the query reads the last ${apiSource.dateRange.defaultDays} days.`}
            </dateRange>
        )}
        <filterableFields>
            {Object.entries(apiSource.fields)
                .filter(([, rule]) => rule.filterOperators.length > 0)
                .map(([fieldId, rule]) => (
                    <field
                        fieldId={fieldId}
                        operators={rule.filterOperators.join(',')}
                    />
                ))}
        </filterableFields>
        {apiSource.incompatible.length > 0 && (
            <incompatibleFields>
                {apiSource.incompatible.map((incompatibility) => (
                    <incompatible
                        fields={incompatibility.fields.join(',')}
                        with={incompatibility.with.join(',')}
                    >
                        {incompatibility.reason}
                    </incompatible>
                ))}
            </incompatibleFields>
        )}
    </liveDataSource>
);

const renderExplore = (explore: Explore) => {
    const requiredFilters = getExploreRequiredFilters(explore);

    return (
        <explore
            name={explore.name}
            label={explore.label}
            baseTable={explore.baseTable}
            type={explore.apiSource ? 'liveDataSource' : undefined}
        >
            {explore.apiSource && renderLiveDataSource(explore.apiSource)}
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

import { subject } from '@casl/ability';
import { Box, SegmentedControl, Title } from '@mantine/core';
import { memo, useEffect, type FC } from 'react';
import {
    explorerActions,
    selectIsResultsExpanded,
    selectIsSqlExpanded,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import ResultsCard from '../ResultsCard/ResultsCard';
import SqlCard from '../SqlCard/SqlCard';
import classes from './ResultsPane.module.css';

// Walkthrough markers for view:SavedChart: reading a chart means opening it
// from Browse and unfolding the rows behind it. See scripts/scope-tours.
const RESULTS_TAB_TOUR_PROPS = {
    'data-tour-anchor': 'results-heading',
    'data-tour-hint': 'Open the results',
    'data-tour-scope': 'view:SavedChart',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid',
    'data-tour-label': 'Open the results',
    'data-tour-title': 'Open and read a chart',
    'data-tour-interactive': 'true',
    'data-tour-via':
        '[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"]',
    'data-tour-docs': 'explore/explore-view.mdx#the-explore-page:li4',
} as const;

// Walkthrough markers for view:CompiledSql: the tab's click shows the SQL
// Lightdash wrote; the pane is the result. See scripts/scope-tours.
const SQL_TAB_TOUR_PROPS = {
    'data-tour-scope': 'view:CompiledSql',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid',
    'data-tour-label': 'Open the SQL',
    'data-tour-title': 'Read the SQL behind a chart',
    'data-tour-interactive': 'true',
    'data-tour-via':
        '[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"]',
    'data-tour-docs': 'explore/explore-view.mdx#the-explore-page:li5',
} as const;

const SQL_PANE_TOUR_PROPS = {
    'data-tour-scope': 'view:CompiledSql',
    'data-tour-step': '1',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid',
    'data-tour-label': 'Every chart is a query on a table',
    'data-tour-docs': 'explore/explore-view.mdx#intro:1',
    'data-tour-return': 'none',
    'data-tour-resultdocs':
        'get-started/explore-your-data.mdx#3-run-your-own-query:1',
} as const;

type Props = {
    projectUuid: string | undefined;
    warehouseConnectionUuid: string | null | undefined;
};

const ResultsPane: FC<Props> = memo(
    ({ projectUuid, warehouseConnectionUuid }) => {
        const dispatch = useExplorerDispatch();
        const tableName = useExplorerSelector(selectTableName);
        const isResultsExpanded = useExplorerSelector(selectIsResultsExpanded);
        const isSqlExpanded = useExplorerSelector(selectIsSqlExpanded);

        const { user } = useApp();
        const ability = useAbilityContext();
        const canViewSql =
            !!projectUuid &&
            ability.can(
                'manage',
                subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                }),
            );

        const activeTab =
            canViewSql && isSqlExpanded && !isResultsExpanded
                ? ExplorerSection.SQL
                : ExplorerSection.RESULTS;

        // The results query only runs while its section is expanded
        useEffect(() => {
            if (activeTab === ExplorerSection.RESULTS && !isResultsExpanded) {
                dispatch(
                    explorerActions.setResultsPaneTab(ExplorerSection.RESULTS),
                );
            }
        }, [activeTab, isResultsExpanded, dispatch]);

        const tabs = canViewSql ? (
            <SegmentedControl
                size="xs"
                disabled={!tableName}
                value={activeTab}
                onChange={(value) =>
                    dispatch(
                        explorerActions.setResultsPaneTab(
                            value === ExplorerSection.SQL
                                ? ExplorerSection.SQL
                                : ExplorerSection.RESULTS,
                        ),
                    )
                }
                data={[
                    {
                        value: ExplorerSection.RESULTS,
                        label: (
                            <Box
                                component="span"
                                data-testid="results-pane-tab-results"
                                {...RESULTS_TAB_TOUR_PROPS}
                            >
                                Results
                            </Box>
                        ),
                    },
                    {
                        value: ExplorerSection.SQL,
                        label: (
                            <Box
                                component="span"
                                data-testid="results-pane-tab-sql"
                                {...SQL_TAB_TOUR_PROPS}
                            >
                                SQL
                            </Box>
                        ),
                    },
                ]}
            />
        ) : (
            <Title order={6} {...RESULTS_TAB_TOUR_PROPS}>
                Results
            </Title>
        );

        return (
            <Box
                className={classes.root}
                {...(canViewSql ? SQL_PANE_TOUR_PROPS : undefined)}
            >
                {activeTab === ExplorerSection.SQL && projectUuid ? (
                    <SqlCard
                        tabs={tabs}
                        projectUuid={projectUuid}
                        warehouseConnectionUuid={warehouseConnectionUuid}
                    />
                ) : (
                    <ResultsCard tabs={tabs} />
                )}
            </Box>
        );
    },
);

ResultsPane.displayName = 'ResultsPane';

export default ResultsPane;

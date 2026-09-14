import { subject } from '@casl/ability';
import {
    formatSql,
    getMergeCompiledSqlText,
    isCustomSqlDimension,
    isSqlTableCalculation,
} from '@lightdash/common';
import { Box, Group, Skeleton, SegmentedControl } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconClipboard } from '@tabler/icons-react';
import {
    lazy,
    memo,
    Suspense,
    useCallback,
    useMemo,
    useState,
    type FC,
} from 'react';
import {
    explorerActions,
    selectIsSqlExpanded,
    selectMetricQuery,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useMergeCompiledSql } from '../../../features/mergeQuery/hooks/useMergeCompiledSql';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { useProject } from '../../../hooks/useProject';
import { useCannotViewCompiledSql } from '../../../hooks/user/useCannotViewCompiledSql';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import Callout from '../../common/Callout';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import { type SqlViewType } from '../../RenderedSql';
import OpenInSqlRunnerButton from './OpenInSqlRunnerButton';

interface SqlCardProps {
    projectUuid: string;
}

// Lazy load because it imports heavy module "@monaco-editor/react"
const LazyRenderedSql = lazy(() =>
    import('../../RenderedSql').then((module) => ({
        default: module.RenderedSql,
    })),
);

const SqlCard: FC<SqlCardProps> = memo(({ projectUuid }) => {
    const { hovered, ref: headingRef } = useHover();
    const [selectedView, setSelectedView] = useState<SqlViewType>('query');

    const sqlIsOpen = useExplorerSelector(selectIsSqlExpanded);
    const dispatch = useExplorerDispatch();

    const unsavedChartVersionTableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const cannotViewCompiledSql = useCannotViewCompiledSql(projectUuid);

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);

    const hasSqlAuthoredFields =
        !!metricQuery.customDimensions?.some(isCustomSqlDimension) ||
        !!metricQuery.tableCalculations?.some(isSqlTableCalculation);
    const cannotViewSqlAuthoredFields =
        hasSqlAuthoredFields && cannotViewCompiledSql;

    const { data, isSuccess, isInitialLoading, error } = useCompiledSql({
        enabled: !!unsavedChartVersionTableName && !cannotViewSqlAuthoredFields,
    });
    // With a merge configured, the legs and the join are what Run executes;
    // the card's copy and open-in-SQL-runner must carry them, not the
    // primary source's SQL alone.
    const merge = useMergeCompiledSql();

    const hasPivotQuery = !merge.isMergeActive && !!data?.pivotQuery;
    const selectedSql = merge.isMergeActive
        ? merge.data && getMergeCompiledSqlText(merge.data)
        : selectedView === 'pivotQuery'
          ? data?.pivotQuery
          : data?.query;

    const formattedSql = useMemo(
        () =>
            selectedSql
                ? formatSql(selectedSql, project?.warehouseConnection?.type)
                : '',
        [selectedSql, project?.warehouseConnection?.type],
    );

    return (
        <CollapsableCard
            isVisualizationCard
            headingRef={headingRef}
            title="SQL"
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!unsavedChartVersionTableName}
            // Walkthrough markers for view:CompiledSql: the heading's click
            // unfolds the SQL Lightdash wrote; the card is the result. See
            // scripts/scope-tours.
            headingTourProps={{
                'data-tour-scope': 'view:CompiledSql',
                'data-tour-step': '2',
                'data-tour-route':
                    '/projects/:projectUuid/saved/:savedQueryUuid',
                'data-tour-label': 'Open the SQL',
                'data-tour-title': 'Read the SQL behind a chart',
                'data-tour-interactive': 'true',
                'data-tour-via':
                    '[data-tour-nav="browse"] >> [data-tour-nav="all-charts"] >> [data-tour-anchor="chart-row"][data-tour-value="Orders over time"]',
                'data-tour-docs':
                    'explore/explore-view.mdx#the-explore-page:li5',
            }}
            tourProps={{
                'data-tour-scope': 'view:CompiledSql',
                'data-tour-step': '1',
                'data-tour-route':
                    '/projects/:projectUuid/saved/:savedQueryUuid',
                'data-tour-label': 'Every chart is a query on a table',
                'data-tour-docs': 'explore/explore-view.mdx#intro:1',
                'data-tour-return': 'none',
                'data-tour-resultdocs':
                    'get-started/explore-your-data.mdx#3-run-your-own-query:1',
            }}
            headerElement={
                !cannotViewSqlAuthoredFields &&
                (hovered || sqlIsOpen) &&
                data &&
                isSuccess ? (
                    <CopyActionIcon
                        value={formattedSql}
                        icon={IconClipboard}
                        copyLabel="Copy SQL"
                        copiedLabel="Copied to clipboard"
                        tooltipPosition="right"
                    />
                ) : undefined
            }
            rightHeaderElement={
                sqlIsOpen &&
                !cannotViewSqlAuthoredFields && (
                    <Group gap="xs">
                        {hasPivotQuery && (
                            <SegmentedControl
                                size="xs"
                                data={[
                                    { label: 'Base Query', value: 'query' },
                                    {
                                        label: 'Chart Query',
                                        value: 'pivotQuery',
                                    },
                                ]}
                                value={selectedView}
                                onChange={(value) =>
                                    setSelectedView(value as SqlViewType)
                                }
                            />
                        )}
                        <Can
                            I="manage"
                            this={subject('SqlRunner', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <OpenInSqlRunnerButton
                                projectUuid={projectUuid}
                                sql={formattedSql}
                                disabled={isInitialLoading || !!error}
                            />
                        </Can>
                    </Group>
                )
            }
        >
            {cannotViewSqlAuthoredFields ? (
                <Box p="sm">
                    <Callout variant="info" title="SQL preview unavailable">
                        This chart contains custom SQL fields that you don't
                        have permission to view.
                    </Callout>
                </Box>
            ) : (
                <Suspense fallback={<Skeleton height={60} radius="sm" />}>
                    <LazyRenderedSql selectedView={selectedView} />
                </Suspense>
            )}
        </CollapsableCard>
    );
});

export default SqlCard;

import { subject } from '@casl/ability';
import {
    formatSql,
    getMergeCompiledSqlText,
    isCustomSqlDimension,
    isSqlTableCalculation,
} from '@lightdash/common';
import { Box, Group, Skeleton, SegmentedControl } from '@mantine/core';
import { IconClipboard } from '@tabler/icons-react';
import {
    lazy,
    memo,
    Suspense,
    useMemo,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useMergeCompiledSql } from '../../../features/mergeQuery/hooks/useMergeCompiledSql';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { useProject } from '../../../hooks/useProject';
import { useCannotViewCompiledSql } from '../../../hooks/user/useCannotViewCompiledSql';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import Callout from '../../common/Callout';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import { type SqlViewType } from '../../RenderedSql';
import ExplorerPaneLayout from '../ResultsPane/ExplorerPaneLayout';
import OpenInSqlRunnerButton from './OpenInSqlRunnerButton';

interface SqlCardProps {
    projectUuid: string;
    warehouseConnectionUuid: string | null | undefined;
    tabs: ReactNode;
}

// Lazy load because it imports heavy module "@monaco-editor/react"
const LazyRenderedSql = lazy(() =>
    import('../../RenderedSql').then((module) => ({
        default: module.RenderedSql,
    })),
);

const SqlCard: FC<SqlCardProps> = memo((props) => {
    const { projectUuid, warehouseConnectionUuid, tabs } = props;
    const [selectedView, setSelectedView] = useState<SqlViewType>('query');

    const unsavedChartVersionTableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const cannotViewCompiledSql = useCannotViewCompiledSql(projectUuid);

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

    const warehouseType = project?.warehouseConnection?.type;
    const formattedSql = useMemo(
        () => (selectedSql ? formatSql(selectedSql, warehouseType) : ''),
        [selectedSql, warehouseType],
    );

    return (
        <ExplorerPaneLayout
            tabs={tabs}
            headerElement={
                !cannotViewSqlAuthoredFields && data && isSuccess ? (
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
                                warehouseConnectionUuid={
                                    warehouseConnectionUuid
                                }
                                connectionRoute={
                                    project
                                        ? (project.connectionRoute ?? 'single')
                                        : undefined
                                }
                                project={project}
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
        </ExplorerPaneLayout>
    );
});

export default SqlCard;

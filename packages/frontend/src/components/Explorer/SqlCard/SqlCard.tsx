import { subject } from '@casl/ability';
import {
    formatSql,
    isCustomSqlDimension,
    isSqlTableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    CopyButton,
    Group,
    SegmentedControl,
    Skeleton,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconCheck, IconClipboard } from '@tabler/icons-react';
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
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { useProject } from '../../../hooks/useProject';
import { useCannotAuthorCustomSql } from '../../../hooks/user/useCannotAuthorCustomSql';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import Callout from '../../common/Callout';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
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
    const cannotAuthorCustomSql = useCannotAuthorCustomSql(projectUuid);

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
        hasSqlAuthoredFields && cannotAuthorCustomSql;

    const { data, isSuccess, isInitialLoading, error } = useCompiledSql({
        enabled: !!unsavedChartVersionTableName && !cannotViewSqlAuthoredFields,
    });

    const hasPivotQuery = !!data?.pivotQuery;
    const selectedSql =
        selectedView === 'pivotQuery' ? data?.pivotQuery : data?.query;

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
            headerElement={
                !cannotViewSqlAuthoredFields &&
                (hovered || sqlIsOpen) &&
                data &&
                isSuccess ? (
                    <CopyButton value={formattedSql} timeout={2000}>
                        {({ copied, copy }) => (
                            <Tooltip
                                variant="xs"
                                label={
                                    copied ? 'Copied to clipboard' : 'Copy SQL'
                                }
                                withArrow
                                position="right"
                                color={copied ? 'green' : 'dark'}
                                fw={500}
                            >
                                <ActionIcon
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                >
                                    {
                                        <MantineIcon
                                            icon={
                                                copied
                                                    ? IconCheck
                                                    : IconClipboard
                                            }
                                        />
                                    }
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                ) : undefined
            }
            rightHeaderElement={
                sqlIsOpen &&
                !cannotViewSqlAuthoredFields && (
                    <Group spacing="xs">
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

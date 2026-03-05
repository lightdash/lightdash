import { subject } from '@casl/ability';
import { useLocalStorage } from '@mantine-8/hooks';
import {
    ActionIcon,
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
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useCompiledPreAggregateSql } from '../../../hooks/useCompiledPreAggregateSql';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { usePreAggregateMatch } from '../../../hooks/usePreAggregateMatch';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { type SqlViewType } from '../../RenderedSql';
import {
    PRE_AGGREGATE_CACHE_ENABLED_DEFAULT,
    PRE_AGGREGATE_CACHE_ENABLED_KEY,
} from '../../RunQuerySettings/defaults';
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

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );
    const { user } = useApp();

    const { data, isSuccess, isInitialLoading, error } = useCompiledSql({
        enabled: !!unsavedChartVersionTableName,
    });

    // Pre-aggregate SQL view
    const [preAggCacheEnabled] = useLocalStorage({
        key: PRE_AGGREGATE_CACHE_ENABLED_KEY,
        defaultValue: PRE_AGGREGATE_CACHE_ENABLED_DEFAULT,
    });
    const { matchResult } = usePreAggregateMatch();
    const preAggregateName =
        matchResult?.hit === true ? matchResult.preAggregateName : null;

    const {
        data: preAggData,
        isInitialLoading: preAggIsLoading,
        error: preAggError,
    } = useCompiledPreAggregateSql({
        preAggregateName,
        enabled: preAggCacheEnabled && preAggregateName !== null,
    });

    const isPreAggView = preAggCacheEnabled && preAggregateName !== null;

    const preAggSqlOverride = useMemo(() => {
        if (!isPreAggView || !preAggData || !preAggData.available)
            return undefined;
        return selectedView === 'pivotQuery' && preAggData.pivotQuery
            ? preAggData.pivotQuery
            : preAggData.query;
    }, [isPreAggView, preAggData, selectedView]);

    const hasPivotQuery = !!data?.pivotQuery;
    const selectedSql =
        selectedView === 'pivotQuery' ? data?.pivotQuery : data?.query;
    const effectiveCopySql = preAggSqlOverride ?? selectedSql ?? '';

    return (
        <CollapsableCard
            isVisualizationCard
            headingRef={headingRef}
            title="SQL"
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!unsavedChartVersionTableName}
            headerElement={
                (hovered || sqlIsOpen) &&
                (preAggSqlOverride !== undefined || (data && isSuccess)) ? (
                    <CopyButton value={effectiveCopySql} timeout={2000}>
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
                sqlIsOpen && (
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
                                sql={preAggSqlOverride ?? selectedSql}
                                disabled={isInitialLoading || !!error}
                            />
                        </Can>
                    </Group>
                )
            }
        >
            <Suspense fallback={<Skeleton height={60} radius="sm" />}>
                <LazyRenderedSql
                    selectedView={selectedView}
                    sqlOverride={preAggSqlOverride}
                    isLoadingOverride={
                        isPreAggView ? preAggIsLoading : undefined
                    }
                    errorOverride={isPreAggView ? preAggError : undefined}
                />
            </Suspense>
        </CollapsableCard>
    );
});

export default SqlCard;

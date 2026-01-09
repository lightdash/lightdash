import { subject } from '@casl/ability';
import { ExploreType } from '@lightdash/common';
import { ActionIcon, CopyButton, Skeleton, Tooltip } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconCheck, IconClipboard } from '@tabler/icons-react';
import { lazy, memo, Suspense, useCallback, type FC } from 'react';
import {
    explorerActions,
    selectIsSqlExpanded,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import MetricFlowSqlCode from '../../../features/metricFlow/components/MetricFlowSqlCode';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
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

    const sqlIsOpen = useExplorerSelector(selectIsSqlExpanded);
    const dispatch = useExplorerDispatch();

    const unsavedChartVersionTableName = useExplorerSelector(selectTableName);
    const { explore, metricFlowSql, metricFlowStatus, metricFlowError } =
        useExplorerQuery();
    const isSemanticLayerExplore = explore?.type === ExploreType.SEMANTIC_LAYER;

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );
    const { user } = useApp();

    const canCompileSql =
        !!unsavedChartVersionTableName && !!explore && !isSemanticLayerExplore;
    const { data, isSuccess } = useCompiledSql({
        enabled: canCompileSql,
    });
    const sql = isSemanticLayerExplore ? metricFlowSql : data?.query;
    const canCopySql = isSemanticLayerExplore
        ? metricFlowStatus === 'success' && !!metricFlowSql
        : isSuccess && !!data?.query;

    return (
        <CollapsableCard
            isVisualizationCard
            headingRef={headingRef}
            title="SQL"
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!unsavedChartVersionTableName}
            headerElement={
                (hovered || sqlIsOpen) && canCopySql && sql ? (
                    <CopyButton value={sql} timeout={2000}>
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
                    <Can
                        I="manage"
                        this={subject('SqlRunner', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <OpenInSqlRunnerButton
                            projectUuid={projectUuid}
                            sql={isSemanticLayerExplore ? sql : undefined}
                            isDisabled={
                                isSemanticLayerExplore &&
                                metricFlowStatus !== 'success'
                            }
                        />
                    </Can>
                )
            }
        >
            {isSemanticLayerExplore ? (
                <MetricFlowSqlCode
                    status={metricFlowStatus ?? 'idle'}
                    sql={metricFlowSql}
                    error={metricFlowError ?? null}
                />
            ) : (
                <Suspense fallback={<Skeleton height={60} radius="sm" />}>
                    <LazyRenderedSql />
                </Suspense>
            )}
        </CollapsableCard>
    );
});

export default SqlCard;

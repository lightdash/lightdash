import {
    getComposerChartConfig,
    getComposerPivotDimensions,
    type AiComposerChartArtifactConfig,
    type CreateSavedChartVersion,
} from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChartBar, IconDeviceFloppy } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { SaveToSpaceOrDashboard } from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { useContentAuthoringEnabled } from '../../../../../hooks/useContentAuthoringEnabled';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import useCreateInAnySpaceAccess from '../../../../../hooks/user/useCreateInAnySpaceAccess';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { type ComposerVizState } from './AiComposerVisualization';
import { useComposerResultItems } from './useComposerResultItems';

type Props = {
    projectUuid: string;
    config: AiComposerChartArtifactConfig;
    state: ComposerVizState;
    /** The terminal node's own result, whose columns the saved chart keeps. */
    results: InfiniteQueryResults;
    metadata: { title: string | null; description: string | null };
};

/**
 * Saves a composer result as a chart: the pipeline, the terminal columns
 * and the chart config as drawn, so the saved chart reruns the pipeline and
 * draws the same way on dashboards and in deliveries.
 */
export const AiComposerSaveChartButton: FC<Props> = ({
    projectUuid,
    config,
    state,
    results,
    metadata,
}) => {
    const [opened, { open, close }] = useDisclosure(false);
    const authoringEnabled = useContentAuthoringEnabled();
    const isEmbed = useIsEmbedded();
    const canCreate = useCreateInAnySpaceAccess(projectUuid, 'SavedChart');
    const terminalNode = useMemo(
        () =>
            config.queries.find(
                (query) => query.nodeId === config.terminalNodeId,
            ) ?? null,
        [config.queries, config.terminalNodeId],
    );
    const items = useComposerResultItems(
        results.columns,
        terminalNode,
        config.terminalNodeId,
    );
    const savedData = useMemo((): CreateSavedChartVersion | null => {
        if (!items || !results.columns) return null;
        const overrideChartType = state.overrideChartType ?? undefined;
        const pivotDimensions = getComposerPivotDimensions(
            state.viz,
            overrideChartType,
        );
        return {
            tableName: config.terminalNodeId,
            metricQuery: items.metricQuery,
            chartConfig: getComposerChartConfig({
                viz: state.viz,
                metricQuery: items.metricQuery,
                fieldsMap: items.itemsMap,
                metadata,
                overrideChartType,
            }),
            tableConfig: {
                columnOrder: [
                    ...items.metricQuery.dimensions,
                    ...items.metricQuery.metrics,
                ],
            },
            pivotConfig:
                pivotDimensions && pivotDimensions.length > 0
                    ? { columns: pivotDimensions }
                    : undefined,
            pipeline: {
                queries: config.queries,
                terminalNodeId: config.terminalNodeId,
                columns: results.columns,
            },
        };
    }, [items, results.columns, state, config, metadata]);

    if (!authoringEnabled || isEmbed || !canCreate || !savedData) return null;
    return (
        <>
            <Tooltip label="Save as chart" position="bottom">
                <ActionIcon size="sm" onClick={open} aria-label="Save as chart">
                    <MantineIcon icon={IconDeviceFloppy} />
                </ActionIcon>
            </Tooltip>
            <MantineModal
                opened={opened}
                onClose={close}
                title="Save chart"
                icon={IconChartBar}
                size="lg"
                modalBodyProps={{ px: 0, py: 0 }}
                modalRootProps={{ closeOnClickOutside: false }}
            >
                <SaveToSpaceOrDashboard
                    projectUuid={projectUuid}
                    savedData={savedData}
                    onConfirm={close}
                    onClose={close}
                    chartMetadata={{
                        name: metadata.title ?? '',
                        description: metadata.description ?? '',
                    }}
                    redirectOnSuccess={false}
                />
            </MantineModal>
        </>
    );
};

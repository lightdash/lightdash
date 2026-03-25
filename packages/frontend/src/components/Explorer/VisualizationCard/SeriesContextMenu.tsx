import { subject } from '@casl/ability';
import {
    buildDrillThroughState,
    drillStackToSteps,
    getDimensions,
    getItemMap,
    hasCustomBinDimension,
    normalizePivotFieldValues,
    type ApiExploreResults,
    type EChartsSeries,
} from '@lightdash/common';
import { Menu, Portal } from '@mantine-8/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconStack } from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import {
    explorerActions,
    selectDrillState,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useToaster from '../../../hooks/toaster/useToaster';
import { useDrillThroughAction } from '../../../hooks/useDrillThroughAction';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import DrillDownMenuItem from '../../MetricQueryData/DrillDownMenuItem';
import DrillIntoSubmenu from '../../MetricQueryData/DrillIntoSubmenu';
import DrillThroughModal from '../../MetricQueryData/DrillThroughModal';
import { useMetricQueryDataContext } from '../../MetricQueryData/useMetricQueryDataContext';
import { getDataFromChartClick } from '../../MetricQueryData/utils';
import { type EchartsSeriesClickEvent } from '../../SimpleChart';

export const SeriesContextMenu: FC<{
    echartsSeriesClickEvent: EchartsSeriesClickEvent | undefined;
    dimensions: string[] | undefined;
    series: EChartsSeries[] | undefined;
    explore: ApiExploreResults | undefined;
}> = memo(({ echartsSeriesClickEvent, dimensions, series, explore }) => {
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const { track } = useTracking();
    const { user } = useApp();

    const context = useVisualizationContext();
    const { resultsData: { metricQuery } = {} } = context;

    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const { openUnderlyingDataModal } = useMetricQueryDataContext();
    const dispatch = useExplorerDispatch();
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const drillState = useExplorerSelector(selectDrillState);

    const savedChart = useExplorerSelector(selectSavedChart);

    const {
        modalState: linkedChartDrillConfig,
        handleDrillThrough,
        closeModal: closeDrillThroughModal,
    } = useDrillThroughAction();

    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();

    const projectUuid = useProjectUuid();

    useEffect(() => {
        if (echartsSeriesClickEvent !== undefined) {
            const e: EchartsSeriesClickEvent = echartsSeriesClickEvent;

            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });
        }
    }, [echartsSeriesClickEvent]);

    const underlyingData = useMemo(() => {
        if (explore !== undefined && echartsSeriesClickEvent !== undefined) {
            const allItemsMap = getItemMap(
                explore,
                metricQuery?.additionalMetrics,
                metricQuery?.tableCalculations,
            );

            return getDataFromChartClick(
                echartsSeriesClickEvent,
                allItemsMap,
                series || [],
            );
        }
    }, [echartsSeriesClickEvent, explore, metricQuery, series]);

    const drillFieldValues = useMemo(
        () =>
            normalizePivotFieldValues(
                underlyingData?.fieldValues,
                underlyingData?.pivotReference,
            ),
        [underlyingData],
    );

    const handleCopyToClipboard = useCallback(() => {
        if (underlyingData === undefined) return;
        const value = underlyingData.value.formatted;

        clipboard.copy(value);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [underlyingData, clipboard, showToastSuccess]);

    const handleViewUnderlyingData = useCallback(() => {
        if (underlyingData === undefined) return;

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });

        openUnderlyingDataModal({
            ...underlyingData,
            dimensions,
        });
    }, [
        underlyingData,
        dimensions,
        openUnderlyingDataModal,
        track,
        user?.data?.organizationUuid,
        user?.data?.userUuid,
        projectUuid,
    ]);

    const handleCancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );

    const onClose = useCallback(() => setContextMenuIsOpen(false), []);

    return (
        <>
            <Menu
                opened={contextMenuIsOpen}
                onClose={onClose}
                withinPortal
                closeOnItemClick
                closeOnEscape
                shadow="md"
                radius={0}
                position="right-start"
                offset={{
                    mainAxis: 0,
                    crossAxis: 0,
                }}
            >
                <Portal>
                    <Menu.Target>
                        <div
                            onContextMenu={handleCancelContextMenu}
                            style={{
                                position: 'absolute',
                                ...contextMenuTargetOffset,
                            }}
                        />
                    </Menu.Target>
                </Portal>

                <Menu.Dropdown>
                    {underlyingData?.value && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                            onClick={handleCopyToClipboard}
                        >
                            Copy value
                        </Menu.Item>
                    )}

                    <Can
                        I="view"
                        this={subject('UnderlyingData', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        {!hasCustomBinDimension(metricQuery) && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconStack} />}
                                onClick={handleViewUnderlyingData}
                            >
                                View underlying data
                            </Menu.Item>
                        )}
                    </Can>

                    <Can
                        I="view"
                        this={subject('Explore', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: projectUuid,
                        })}
                    >
                        <DrillDownMenuItem
                            {...underlyingData}
                            trackingData={{
                                organizationId: user?.data?.organizationUuid,
                                userId: user?.data?.userUuid,
                                projectId: projectUuid,
                            }}
                        />
                    </Can>

                    <DrillIntoSubmenu
                        drillConfig={unsavedChartVersion.drillConfig}
                        fieldValues={drillFieldValues}
                        drillStack={drillState?.stack}
                        onDrillDown={(params) =>
                            dispatch(explorerActions.applyDrill(params))
                        }
                        onDrillThrough={({
                            drillPathId,
                            linkedChartUuid,
                            fieldValues: clickedValues,
                            dimensionIds: clickedDims,
                        }) => {
                            if (!savedChart?.uuid) return;

                            const existingSteps = drillStackToSteps(
                                drillState?.stack ?? [],
                            );

                            handleDrillThrough(
                                buildDrillThroughState({
                                    sourceChartUuid: savedChart.uuid,
                                    drillPathId,
                                    linkedChartUuid,
                                    drillConfig:
                                        unsavedChartVersion.drillConfig,
                                    fieldValues: clickedValues,
                                    dimensionIds: clickedDims,
                                    dimensions: explore
                                        ? getDimensions(explore)
                                        : [],
                                    existingDrillSteps: existingSteps,
                                }),
                            );
                        }}
                    />
                </Menu.Dropdown>
            </Menu>

            {linkedChartDrillConfig && (
                <DrillThroughModal
                    opened={!!linkedChartDrillConfig}
                    onClose={closeDrillThroughModal}
                    sourceChartUuid={linkedChartDrillConfig.sourceChartUuid}
                    linkedChartUuid={linkedChartDrillConfig.linkedChartUuid}
                    drillSteps={linkedChartDrillConfig.drillSteps}
                    filterSummary={linkedChartDrillConfig.filterSummary}
                />
            )}
        </>
    );
});

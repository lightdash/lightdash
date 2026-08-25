import { FeatureFlags, type ChartType } from '@lightdash/common';
import { ActionIcon, Anchor, Group, Stack, Text, Tooltip } from '@mantine/core';
import {
    IconArrowLeft,
    IconFilePencil,
    IconSettings,
    IconX,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useCanEditDataAppChecker } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import {
    explorerActions,
    selectChartSidebarStep,
    selectIsChartTypeAuthoring,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    CHART_GALLERY_SIDEBAR_TITLE_ID,
    ChartGalleryContext,
} from '../../common/ChartGallery/ChartGalleryContext';
import MantineIcon from '../../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import VisualizationConfig from '../VisualizationCard/VisualizationConfig';
import { useChartTypeOptions } from '../VisualizationCardOptions/useChartTypeOptions';
import ExplorerChartTypeGallery, {
    ChartTypeThumbnail,
} from './ChartTypeGallery';
import classes from './ExplorerChartSidebar.module.css';

type Props = {
    chartType: ChartType;
    onClose: () => void;
};

const ExplorerChartSidebar: FC<Props> = ({ chartType, onClose }) => {
    // The step lives in the store so authoring can hand back to it.
    const step = useExplorerSelector(selectChartSidebarStep);
    // While a type is being authored the sidebar configures it and stays.
    const isAuthoring = useExplorerSelector(selectIsChartTypeAuthoring);
    const dispatch = useExplorerDispatch();
    const showChoose = () =>
        dispatch(explorerActions.setChartSidebarStep('choose'));
    const showConfigure = () =>
        dispatch(explorerActions.setChartSidebarStep('configure'));
    const handleClose = () => {
        showConfigure();
        onClose();
    };
    const projectUuid = useProjectUuid();
    const { visualizationConfig } = useVisualizationContext();
    const { getSelectedChartTypeItem } = useChartTypeOptions();
    const dataAppVizUuid = isDataAppVizVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : null;
    const { data: selectedProjectType } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid ?? undefined,
        null,
    );
    const canEditChartType = useCanEditDataAppChecker(projectUuid);
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const canEditSelectedType =
        dataAppsEnabled &&
        selectedProjectType !== undefined &&
        canEditChartType(selectedProjectType);

    const selectedItem = getSelectedChartTypeItem(
        chartType,
        selectedProjectType ?? null,
    );
    // A type being authored has no name until its first version lands.
    const selectedLabel =
        isAuthoring && !selectedProjectType
            ? 'New chart type'
            : selectedItem.label;

    return (
        <ChartGalleryContext.Provider value={true}>
            <Stack className={classes.root} gap={0}>
                <Group
                    className={classes.header}
                    justify="space-between"
                    wrap="nowrap"
                >
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconSettings} />
                        <Text
                            id={CHART_GALLERY_SIDEBAR_TITLE_ID}
                            fw={600}
                            tabIndex={-1}
                        >
                            {/* While authoring, the panel holds the type's
                                generated options, titled as the gallery
                                builder titles them. */}
                            {isAuthoring
                                ? 'Generated options'
                                : 'Configure chart'}
                        </Text>
                    </Group>
                    {!isAuthoring && (
                        <Tooltip
                            label="Close visualization config"
                            position="right"
                        >
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Close visualization config"
                                onClick={handleClose}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>

                <Stack className={classes.body} gap="md">
                    {step === 'choose' ? (
                        <>
                            <Group gap="xs" wrap="nowrap">
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    aria-label="Back to configuration"
                                    onClick={showConfigure}
                                >
                                    <MantineIcon icon={IconArrowLeft} />
                                </ActionIcon>
                                <Text fw={600} fz="sm">
                                    Choose chart type
                                </Text>
                            </Group>
                            <ExplorerChartTypeGallery
                                onSelected={showConfigure}
                            />
                        </>
                    ) : (
                        <Stack className={classes.configure} gap="md">
                            <Group wrap="nowrap" gap="sm">
                                <ChartTypeThumbnail
                                    small
                                    icon={selectedItem.icon}
                                    rotatedIcon={selectedItem.rotatedIcon}
                                />
                                <Text fw={600} fz="sm" truncate flex={1}>
                                    {selectedLabel}
                                </Text>
                                {!isAuthoring && canEditSelectedType && (
                                    <Tooltip
                                        label="Edit chart type"
                                        position="bottom"
                                    >
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="sm"
                                            aria-label="Edit chart type"
                                            onClick={() =>
                                                dataAppVizUuid !== null &&
                                                dispatch(
                                                    explorerActions.startChartTypeAuthoring(
                                                        { dataAppVizUuid },
                                                    ),
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                icon={IconFilePencil}
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                                {!isAuthoring && (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        className={classes.buttonAnchor}
                                        fz="xs"
                                        fw={500}
                                        onClick={showChoose}
                                    >
                                        Change
                                    </Anchor>
                                )}
                            </Group>

                            <VisualizationConfig
                                chartType={chartType}
                                onClose={onClose}
                                withHeader={false}
                                withChartTypePicker={false}
                            />
                        </Stack>
                    )}
                </Stack>
            </Stack>
        </ChartGalleryContext.Provider>
    );
};

export default ExplorerChartSidebar;

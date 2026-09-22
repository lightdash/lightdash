import {
    FeatureFlags,
    isOfficialChartType,
    type ChartType,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconLayoutSidebarRightCollapse,
    IconSettings,
} from '@tabler/icons-react';
import { useEffect, useRef, type FC } from 'react';
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
    CHART_GALLERY_SEARCH_ID,
    CHART_GALLERY_SIDEBAR_TITLE_ID,
    ChartGalleryContext,
} from '../../common/ChartGallery/ChartGalleryContext';
import MantineIcon from '../../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import VisualizationConfig from '../VisualizationCard/VisualizationConfig';
import ExplorerChartTypeGallery, {
    ChartTypeThumbnail,
} from './ChartTypeGallery';
import classes from './ExplorerChartSidebar.module.css';
import { useChartTypeOptions } from './useChartTypeOptions';

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

    // The step swaps the panel's whole body, so whatever was clicked unmounts.
    // Follow it: into the gallery's search, back onto the control that opened
    // it. Only on a change, so restoring a step from the URL cannot steal
    // focus on load.
    const changeRef = useRef<HTMLButtonElement>(null);
    const previousStep = useRef(step);
    useEffect(() => {
        if (previousStep.current === step) return;
        previousStep.current = step;
        if (step === 'choose') {
            document.getElementById(CHART_GALLERY_SEARCH_ID)?.focus();
        } else {
            (
                changeRef.current ??
                document.getElementById(CHART_GALLERY_SIDEBAR_TITLE_ID)
            )?.focus();
        }
    }, [step]);
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
        dataAppVizUuid,
        null,
    );
    const canEditChartType = useCanEditDataAppChecker(projectUuid);
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const canEditSelectedType =
        dataAppsEnabled &&
        selectedProjectType !== undefined &&
        canEditChartType(selectedProjectType) &&
        !isOfficialChartType(selectedProjectType);

    const selectedItem = getSelectedChartTypeItem(
        chartType,
        selectedProjectType ?? null,
    );
    // A type being authored has no name until its first version lands.
    const selectedLabel =
        isAuthoring && !selectedProjectType
            ? 'New chart type'
            : selectedItem.label;
    const showEdit = !isAuthoring && canEditSelectedType;
    const closeButton = !isAuthoring && (
        <Tooltip label="Close visualization config" position="bottom">
            <ActionIcon
                variant="default"
                size="sm"
                aria-label="Close visualization config"
                onClick={handleClose}
            >
                <MantineIcon icon={IconLayoutSidebarRightCollapse} />
            </ActionIcon>
        </Tooltip>
    );
    const selectedChartDetails = (
        <>
            <ChartTypeThumbnail
                small
                icon={selectedItem.icon}
                rotatedIcon={selectedItem.rotatedIcon}
            />
            <Stack gap={2} flex={1} miw={0}>
                <Text
                    id={
                        !isAuthoring
                            ? CHART_GALLERY_SIDEBAR_TITLE_ID
                            : undefined
                    }
                    fw={600}
                    fz="sm"
                    truncate
                    title={selectedLabel}
                >
                    {selectedLabel}
                </Text>
                {!isAuthoring && (
                    <Text className={classes.buttonAnchor} fz="xs" fw={500}>
                        Change
                    </Text>
                )}
            </Stack>
        </>
    );

    return (
        <ChartGalleryContext.Provider value={true}>
            <Stack className={classes.root} gap={0}>
                {isAuthoring && (
                    <Group className={classes.header} wrap="nowrap">
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
                                Generated options
                            </Text>
                        </Group>
                    </Group>
                )}

                <Stack
                    className={classes.body}
                    gap="md"
                    pt={isAuthoring ? 'md' : 0}
                >
                    {step === 'choose' ? (
                        <>
                            <Group justify="space-between" wrap="nowrap">
                                <Group gap="xs" wrap="nowrap">
                                    <Tooltip label="Back to configuration">
                                        <ActionIcon
                                            size="sm"
                                            aria-label="Back to configuration"
                                            onClick={showConfigure}
                                        >
                                            <MantineIcon
                                                icon={IconArrowLeft}
                                                size={14}
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Text
                                        id={
                                            !isAuthoring
                                                ? CHART_GALLERY_SIDEBAR_TITLE_ID
                                                : undefined
                                        }
                                        fw={600}
                                        fz="sm"
                                        tabIndex={-1}
                                    >
                                        Choose chart type
                                    </Text>
                                </Group>
                                {closeButton}
                            </Group>
                            <ExplorerChartTypeGallery
                                onConfigure={showConfigure}
                            />
                        </>
                    ) : (
                        <Stack className={classes.configure} gap="md">
                            <Group wrap="nowrap" gap="sm" align="center">
                                {isAuthoring ? (
                                    <Group
                                        className={classes.selectedChartButton}
                                        wrap="nowrap"
                                    >
                                        {selectedChartDetails}
                                    </Group>
                                ) : (
                                    <UnstyledButton
                                        ref={changeRef}
                                        type="button"
                                        aria-label="Change chart type"
                                        data-chart-type-gallery-change
                                        className={classes.selectedChartButton}
                                        onClick={showChoose}
                                    >
                                        {selectedChartDetails}
                                    </UnstyledButton>
                                )}
                                {showEdit && (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        aria-label="Edit chart type"
                                        className={classes.buttonAnchor}
                                        fz="xs"
                                        fw={500}
                                        onClick={() =>
                                            dataAppVizUuid !== null &&
                                            dispatch(
                                                explorerActions.startChartTypeAuthoring(
                                                    {
                                                        dataAppVizUuid,
                                                    },
                                                ),
                                            )
                                        }
                                    >
                                        Edit
                                    </Anchor>
                                )}
                                {closeButton}
                            </Group>

                            <VisualizationConfig chartType={chartType} />
                        </Stack>
                    )}
                </Stack>
            </Stack>
        </ChartGalleryContext.Provider>
    );
};

export default ExplorerChartSidebar;

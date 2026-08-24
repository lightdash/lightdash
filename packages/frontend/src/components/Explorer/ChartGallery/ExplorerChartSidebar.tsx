import { type ChartType } from '@lightdash/common';
import { ActionIcon, Anchor, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconSettings, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { ChartGalleryContext } from '../../common/ChartGallery/ChartGalleryContext';
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

type Mode = 'choose' | 'configure';

const ExplorerChartSidebar: FC<Props> = ({ chartType, onClose }) => {
    const [mode, setMode] = useState<Mode>('configure');
    const projectUuid = useProjectUuid();
    const { visualizationConfig } = useVisualizationContext();
    const { getSelectedChartTypeItem } = useChartTypeOptions();
    const dataAppVizUuid = isDataAppVizVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : undefined;
    const { data: selectedProjectType } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid,
        null,
    );

    const selectedItem = getSelectedChartTypeItem(
        chartType,
        selectedProjectType ?? null,
    );

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
                        <Text fw={600}>Configure chart</Text>
                    </Group>
                    <Tooltip
                        label="Close visualization config"
                        position="right"
                    >
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Close visualization config"
                            onClick={onClose}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <Stack className={classes.body} gap="md">
                    {mode === 'choose' ? (
                        <>
                            <Group gap="xs" wrap="nowrap">
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    aria-label="Back to configuration"
                                    onClick={() => setMode('configure')}
                                >
                                    <MantineIcon icon={IconArrowLeft} />
                                </ActionIcon>
                                <Text fw={600} fz="sm">
                                    Choose chart type
                                </Text>
                            </Group>
                            <ExplorerChartTypeGallery
                                onSelected={() => setMode('configure')}
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
                                    {selectedItem.label}
                                </Text>
                                <Anchor
                                    component="button"
                                    type="button"
                                    className={classes.buttonAnchor}
                                    fz="xs"
                                    fw={500}
                                    onClick={() => setMode('choose')}
                                >
                                    Change
                                </Anchor>
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

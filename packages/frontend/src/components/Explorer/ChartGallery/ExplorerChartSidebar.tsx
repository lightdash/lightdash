import { ChartKind, ChartType, getAppDisplayName } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconPuzzle,
    IconSettings,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import { ChartGalleryContext } from '../../common/ChartGallery/ChartGalleryContext';
import MantineIcon from '../../common/MantineIcon';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import VisualizationConfig from '../VisualizationCard/VisualizationConfig';
import {
    useChartTypeOptions,
    type SelectedChartType,
} from '../VisualizationCardOptions/useChartTypeOptions';
import ExplorerChartTypeGallery, {
    ChartTypeThumbnail,
} from './ChartTypeGallery';
import classes from './ExplorerChartSidebar.module.css';

type Props = {
    chartType: ChartType;
    onClose: () => void;
};

type Mode = 'choose' | 'configure';

const isMode = (value: string): value is Mode =>
    value === 'choose' || value === 'configure';

const ExplorerChartSidebar: FC<Props> = ({ chartType, onClose }) => {
    const [mode, setMode] = useState<Mode>('configure');
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const location = useLocation();
    const { visualizationConfig } = useVisualizationContext();
    const { selectedChartType, vegaOption } = useChartTypeOptions();
    const dataAppVizUuid = isDataAppVizVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : undefined;
    const { data: selectedProjectType } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid,
        null,
    );

    const canEditSelectedType = useCanEditDataApp(projectUuid, {
        spaceUuid: selectedProjectType?.spaceUuid ?? null,
        createdByUserUuid: selectedProjectType?.createdByUserUuid ?? null,
    });

    const isProjectType = chartType === ChartType.DATA_APP_VIZ;
    const selectedItem: SelectedChartType = isProjectType
        ? {
              id: ChartKind.DATA_APP_VIZ,
              label: selectedProjectType
                  ? getAppDisplayName(
                        selectedProjectType.name,
                        selectedProjectType.dataAppVizUuid,
                    )
                  : 'Project chart type',
              icon: IconPuzzle,
              rotatedIcon: false,
          }
        : chartType === ChartType.CUSTOM
          ? vegaOption
          : selectedChartType;

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
                    <SegmentedControl
                        fullWidth
                        value={mode}
                        onChange={(value) => {
                            if (isMode(value)) setMode(value);
                        }}
                        data={[
                            { value: 'choose', label: 'Choose type' },
                            { value: 'configure', label: 'Configure' },
                        ]}
                    />

                    {mode === 'choose' ? (
                        <ExplorerChartTypeGallery
                            onSelected={() => setMode('configure')}
                        />
                    ) : (
                        <Stack className={classes.configure} gap="md">
                            <Button
                                variant="subtle"
                                size="xs"
                                px={0}
                                leftSection={
                                    <MantineIcon icon={IconArrowLeft} />
                                }
                                onClick={() => setMode('choose')}
                            >
                                Change chart type
                            </Button>

                            <Paper
                                className={classes.selectedChart}
                                withBorder
                                radius="md"
                                p="sm"
                            >
                                <Group wrap="nowrap">
                                    <ChartTypeThumbnail
                                        icon={selectedItem.icon}
                                        rotatedIcon={selectedItem.rotatedIcon}
                                    />
                                    <Stack gap={3}>
                                        <Text fw={600}>
                                            {selectedItem.label}
                                        </Text>
                                        <Group gap="xs">
                                            {isProjectType &&
                                            selectedProjectType &&
                                            canEditSelectedType ? (
                                                <Anchor
                                                    component={Link}
                                                    to={{
                                                        pathname: `/projects/${projectUuid}/chart-types/${selectedProjectType.dataAppVizUuid}`,
                                                        search: location.search,
                                                    }}
                                                    fz="xs"
                                                    fw={500}
                                                >
                                                    Edit ↗
                                                </Anchor>
                                            ) : null}
                                        </Group>
                                    </Stack>
                                </Group>
                                {isProjectType &&
                                selectedProjectType?.description ? (
                                    <Text fz="xs" c="dimmed" lh={1.5} mt="xs">
                                        {selectedProjectType.description}
                                    </Text>
                                ) : null}
                            </Paper>

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

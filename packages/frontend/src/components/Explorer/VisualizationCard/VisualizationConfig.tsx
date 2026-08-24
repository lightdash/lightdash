import { assertUnreachable, ChartType } from '@lightdash/common';
import {
    ActionIcon,
    Divider,
    Group,
    Loader,
    ScrollArea,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { lazy, Suspense, useMemo, type FC } from 'react';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import MantineIcon from '../../common/MantineIcon';
import { ConfigTabs as BigNumberConfigTabs } from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import { ConfigTabs as ChartConfigTabs } from '../../VisualizationConfigs/ChartConfigPanel/ConfigTabs';
import { ConfigTabs as DataAppVizConfigTabs } from '../../VisualizationConfigs/DataAppVizConfig/DataAppVizConfigTabs';
import { ConfigTabs as FunnelChartConfigTabs } from '../../VisualizationConfigs/FunnelChartConfig/FunnelChartConfigTabs';
import { ConfigTabs as GaugeConfigTabs } from '../../VisualizationConfigs/GaugeConfig/GaugeConfigTabs';
import { ConfigTabs as MapConfigTabs } from '../../VisualizationConfigs/MapConfig';
import { ConfigTabs as PieChartConfigTabs } from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import { ConfigTabs as SankeyConfigTabs } from '../../VisualizationConfigs/SankeyConfig/SankeyConfigTabs';
import { ConfigTabs as TableConfigTabs } from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import { ConfigTabs as TreemapConfigTabs } from '../../VisualizationConfigs/TreemapConfig/TreemapConfigTabs';
import VisualizationCardOptions from '../VisualizationCardOptions';
import classes from './VisualizationConfig.module.css';

// Lazy load CustomVisConfig as it includes the heavy Monaco editor
const CustomVisConfigTabsLazy = lazy(() =>
    import('../../VisualizationConfigs/ChartConfigPanel/CustomVis/CustomVisConfig').then(
        (module) => ({ default: module.ConfigTabs }),
    ),
);

type Props = {
    chartType: ChartType;
    onClose: () => void;
    withHeader?: boolean;
    withChartTypePicker?: boolean;
};

const VisualizationConfig: FC<Props> = ({
    chartType,
    onClose,
    withHeader = true,
    withChartTypePicker = true,
}) => {
    const ConfigTab = useMemo(() => {
        switch (chartType) {
            case ChartType.BIG_NUMBER:
                return BigNumberConfigTabs;
            case ChartType.TABLE:
                return TableConfigTabs;
            case ChartType.CARTESIAN:
                return ChartConfigTabs;
            case ChartType.PIE:
                return PieChartConfigTabs;
            case ChartType.FUNNEL:
                return FunnelChartConfigTabs;
            case ChartType.TREEMAP:
                return TreemapConfigTabs;
            case ChartType.GAUGE:
                return GaugeConfigTabs;
            case ChartType.MAP:
                return MapConfigTabs;
            case ChartType.CUSTOM:
                // Return a wrapper component that handles lazy loading
                return () => (
                    <Suspense fallback={<Loader size="sm" />}>
                        <CustomVisConfigTabsLazy />
                    </Suspense>
                );
            case ChartType.SANKEY:
                return SankeyConfigTabs;
            case ChartType.DATA_APP_VIZ:
                return DataAppVizConfigTabs;
            default:
                return assertUnreachable(
                    chartType,
                    `Chart type ${chartType} not supported`,
                );
        }
    }, [chartType]);

    return (
        <>
            {withHeader ? (
                <>
                    <Group justify="space-between">
                        <Text fz={16} fw={600}>
                            Configure chart
                        </Text>

                        <Tooltip
                            label="Close visualization config"
                            position="right"
                        >
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                onClick={onClose}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    <Divider />
                </>
            ) : null}

            {withChartTypePicker ? (
                <Group>
                    <Text fw={600}>Chart type</Text>
                    <VisualizationCardOptions />
                </Group>
            ) : null}

            <ScrollArea
                className={classes.scrollArea}
                offsetScrollbars
                scrollbars="y"
                classNames={{
                    content: scrollAreaClasses.verticalContent,
                }}
                type="hover"
                scrollbarSize={8}
            >
                <ConfigTab />
            </ScrollArea>
        </>
    );
};

export default VisualizationConfig;

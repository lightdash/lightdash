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
import MantineIcon from '../../common/MantineIcon';
import { ConfigTabs as BigNumberConfigTabs } from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import { ConfigTabs as ChartConfigTabs } from '../../VisualizationConfigs/ChartConfigPanel/ConfigTabs';
import { ConfigTabs as FunnelChartConfigTabs } from '../../VisualizationConfigs/FunnelChartConfig/FunnelChartConfigTabs';
import { ConfigTabs as GaugeConfigTabs } from '../../VisualizationConfigs/GaugeConfig/GaugeConfigTabs';
import { ConfigTabs as MapConfigTabs } from '../../VisualizationConfigs/MapConfig';
import { ConfigTabs as PieChartConfigTabs } from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import { ConfigTabs as TableConfigTabs } from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import { ConfigTabs as TreemapConfigTabs } from '../../VisualizationConfigs/TreemapConfig/TreemapConfigTabs';
import VisualizationCardOptions from '../VisualizationCardOptions';

// Lazy load CustomVisConfig as it includes the heavy Monaco editor
const CustomVisConfigTabsLazy = lazy(() =>
    import(
        '../../VisualizationConfigs/ChartConfigPanel/CustomVis/CustomVisConfig'
    ).then((module) => ({ default: module.ConfigTabs })),
);

type Props = {
    chartType: ChartType;
    onClose: () => void;
};

const VisualizationConfig: FC<Props> = ({ chartType, onClose }) => {
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
            default:
                return assertUnreachable(
                    chartType,
                    `Chart type ${chartType} not supported`,
                );
        }
    }, [chartType]);

    return (
        <>
            <Group position="apart">
                <Text fz={16} fw={600}>
                    Configure chart
                </Text>

                <Tooltip label="Close visualization config" position="right">
                    <ActionIcon size="sm" onClick={onClose}>
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Divider />

            <Group>
                <Text fw={600}>Chart type</Text>

                <VisualizationCardOptions />
            </Group>

            <ScrollArea
                offsetScrollbars
                variant="primary"
                className="only-vertical"
                sx={{ flex: 1 }}
                type="hover"
                scrollbarSize={8}
            >
                <ConfigTab />
            </ScrollArea>
        </>
    );
};

export default VisualizationConfig;

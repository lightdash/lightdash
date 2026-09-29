import { assertUnreachable, ChartType } from '@lightdash/common';
import { Loader, ScrollArea, Text } from '@mantine/core';
import { lazy, Suspense, useMemo, type FC } from 'react';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import Callout from '../../common/Callout';
import { ConfigTabs as BigNumberConfigTabs } from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import { ConfigTabs as ChartConfigTabs } from '../../VisualizationConfigs/ChartConfigPanel/ConfigTabs';
import { useIsVegaEditorAvailable } from '../../VisualizationConfigs/ChartConfigPanel/CustomVis/useIsVegaEditorAvailable';
import { Config } from '../../VisualizationConfigs/common/Config';
import { ConfigTabs as DataAppVizConfigTabs } from '../../VisualizationConfigs/DataAppVizConfig/DataAppVizConfigTabs';
import { ConfigTabs as FunnelChartConfigTabs } from '../../VisualizationConfigs/FunnelChartConfig/FunnelChartConfigTabs';
import { ConfigTabs as GaugeConfigTabs } from '../../VisualizationConfigs/GaugeConfig/GaugeConfigTabs';
import { ConfigTabs as MapConfigTabs } from '../../VisualizationConfigs/MapConfig';
import { ConfigTabs as PieChartConfigTabs } from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import { ConfigTabs as SankeyConfigTabs } from '../../VisualizationConfigs/SankeyConfig/SankeyConfigTabs';
import { ConfigTabs as TableConfigTabs } from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import { ConfigTabs as TreemapConfigTabs } from '../../VisualizationConfigs/TreemapConfig/TreemapConfigTabs';
import classes from './VisualizationConfig.module.css';

// Lazy load CustomVisConfig as it includes the heavy Monaco editor
const CustomVisConfigTabsLazy = lazy(() =>
    import('../../VisualizationConfigs/ChartConfigPanel/CustomVis/CustomVisConfig').then(
        (module) => ({ default: module.ConfigTabs }),
    ),
);

const VegaEditorUnavailable: FC = () => (
    <Config>
        <Config.Section>
            <Callout variant="info" hideIcon p="xs">
                <Text fz="xs">
                    Vega charts can't be edited in embedded views.
                </Text>
            </Callout>
        </Config.Section>
    </Config>
);

type Props = {
    chartType: ChartType;
};

const VisualizationConfig: FC<Props> = ({ chartType }) => {
    const isVegaEditorAvailable = useIsVegaEditorAvailable();
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
                if (!isVegaEditorAvailable) return VegaEditorUnavailable;
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
    }, [chartType, isVegaEditorAvailable]);

    return (
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
    );
};

export default VisualizationConfig;

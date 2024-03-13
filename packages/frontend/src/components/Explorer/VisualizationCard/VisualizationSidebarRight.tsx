import { assertUnreachable, ChartType } from '@lightdash/common';
import { Group, Portal, Text } from '@mantine/core';
import { FC, memo, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../providers/AppProvider';
import BigNumberConfigTabs from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import ChartConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/ChartConfigTabs';
import CustomVisConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/CustomVisConfigTabs';
import PieChartConfigTabs from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import TableConfigTabs from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import VisualizationCardOptions from '../VisualizationCardOptions';

export const VisualizationSidebarRight: FC<{
    chartType: ChartType;
}> = memo(({ chartType }) => {
    const { health } = useApp();

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
            case ChartType.CUSTOM:
                return CustomVisConfigTabs;
            default:
                return assertUnreachable(
                    chartType,
                    `Chart type ${chartType} not supported`,
                );
        }
    }, [chartType]);

    // TODO: this is a hack to wait for the right sidebar to be rendered and then append the visualization sidebar.
    const [elementExists, setElementExists] = useState(false);

    useEffect(() => {
        if (elementExists) return;
        const interval = setInterval(() => {
            const el = document.getElementById('right-sidebar');
            console.log(el);
            if (el) {
                setElementExists(true);
                clearInterval(interval);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [elementExists]);

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return elementExists ? (
        <Portal target="#right-sidebar">
            <Text fw={600}>Configure chart</Text>
            <Group py="lg">
                <Text fw={600}>Chart type</Text>
                <VisualizationCardOptions />
            </Group>

            <ConfigTab />
        </Portal>
    ) : null;
});

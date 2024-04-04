import {
    assertUnreachable,
    ChartType,
    type SavedChart,
} from '@lightdash/common';
import { Button, Drawer, Stack, Text } from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { BANNER_HEIGHT, NAVBAR_HEIGHT } from '../../NavBar';
import { ConfigTabs as BigNumberConfigTabs } from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import { ConfigTabs as ChartConfigTabs } from '../../VisualizationConfigs/ChartConfigPanel/ConfigTabs';
import CustomVisConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/CustomVisConfigTabs';
import { ConfigTabs as PieChartConfigTabs } from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import { ConfigTabs as TableConfigTabs } from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import VisualizationCardOptions from '../VisualizationCardOptions';

const VisualizationSidebar: FC<{
    chartType: ChartType;
    savedChart?: SavedChart;
    isProjectPreview?: boolean;
    isOpen: boolean;
    onClose: () => void;
    onOpen: () => void;
}> = memo(
    ({ chartType, savedChart, isProjectPreview, isOpen, onOpen, onClose }) => {
        const sidebarVerticalOffset = useMemo(() => {
            let offset = NAVBAR_HEIGHT;

            if (isProjectPreview) {
                offset += BANNER_HEIGHT;
            }

            const isQueryingFromTables = savedChart === undefined;
            if (!isQueryingFromTables) {
                offset += 65;
            }

            return offset;
        }, [isProjectPreview, savedChart]);

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

        return (
            <>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    onClick={isOpen ? onClose : onOpen}
                    rightIcon={
                        <MantineIcon
                            color="gray"
                            icon={
                                isOpen
                                    ? IconLayoutSidebarLeftCollapse
                                    : IconLayoutSidebarLeftExpand
                            }
                        />
                    }
                >
                    {isOpen ? 'Close configure' : 'Configure'}
                </Button>

                <Drawer
                    title={
                        <Text fz="sm" fw={600}>
                            Chart builder
                        </Text>
                    }
                    zIndex={100}
                    opened={isOpen}
                    withOverlay={false}
                    lockScroll={false}
                    shadow="lg"
                    size={410}
                    styles={(theme) => ({
                        inner: {
                            top: sidebarVerticalOffset,
                            height: `calc(100% - ${sidebarVerticalOffset}px)`,
                        },
                        body: {
                            paddingTop: theme.spacing.xs,
                        },
                        header: {
                            paddingBottom: theme.spacing.sm,
                            marginBottom: theme.spacing.xs,
                        },
                    })}
                    onClose={onClose}
                >
                    <Stack spacing="xs">
                        <VisualizationCardOptions />

                        <ConfigTab />
                    </Stack>
                </Drawer>
            </>
        );
    },
);
export default VisualizationSidebar;

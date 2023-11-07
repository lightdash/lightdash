import { assertUnreachable, ChartType, SavedChart } from '@lightdash/common';
import { Button, Drawer, Group, Stack, Text } from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { FC, memo, useState } from 'react';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import BigNumberConfigTabs from '../../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import ChartConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/ChartConfigTabs';
import CustomVisConfigTabs from '../../VisualizationConfigs/ChartConfigPanel/CustomVisConfigTabs';
import PieChartConfigTabs from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import TableConfigTabs from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import VisualizationCardOptions from '../VisualizationCardOptions';

const VisualizationSidebar: FC<{
    chartType: ChartType;
    savedChart?: SavedChart;
    isProjectPreview?: boolean;
    isEditingDashboardChart?: boolean;
}> = memo(
    ({ chartType, savedChart, isProjectPreview, isEditingDashboardChart }) => {
        const [isOpen, setIsOpen] = useState(false);

        const sidebarVerticalOffset =
            (isProjectPreview && !isEditingDashboardChart ? 35 : 0) + // Preview header
            (isEditingDashboardChart ? 35 : 50) + // Normal header or dashboardChart header
            (savedChart === undefined ? 0 : 80); // Include the saved chart header or not

        return (
            <>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    onClick={() => setIsOpen((old) => !old)}
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
                    title={<Text fw={600}>Configure chart</Text>}
                    zIndex={100}
                    opened={isOpen}
                    withOverlay={false}
                    lockScroll={false}
                    shadow="lg"
                    size={410}
                    styles={(theme) => ({
                        header: {
                            borderBottom: `1px solid ${theme.colors.gray[4]}`,
                            borderTop: `1px solid ${theme.colors.gray[2]}`,
                        },
                        inner: {
                            marginTop: sidebarVerticalOffset,
                        },
                    })}
                    onClose={() => setIsOpen((old) => !old)}
                >
                    <Stack mt="md" pb="xl" spacing="lg">
                        <Group>
                            <Text fw={600}>Chart type</Text>
                            <VisualizationCardOptions />
                        </Group>
                        {(() => {
                            switch (chartType) {
                                case ChartType.BIG_NUMBER:
                                    return <BigNumberConfigTabs />;
                                case ChartType.TABLE:
                                    return <TableConfigTabs />;
                                case ChartType.CARTESIAN:
                                    return <ChartConfigTabs />;
                                case ChartType.PIE:
                                    return <PieChartConfigTabs />;
                                case ChartType.CUSTOM:
                                    return <CustomVisConfigTabs />;
                                default:
                                    return assertUnreachable(
                                        chartType,
                                        `Chart type ${chartType} not supported`,
                                    );
                            }
                        })()}
                    </Stack>
                </Drawer>
            </>
        );
    },
);
export default VisualizationSidebar;

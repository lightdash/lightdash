import { assertUnreachable, ChartType } from '@lightdash/common';
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
import PieChartConfigTabs from '../../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import TableConfigTabs from '../../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import VisualizationCardOptions from '../VisualizationCardOptions';

const VisualizationSidebar: FC<{
    chartType: ChartType;
    isEditingDashboardChart: boolean;
}> = memo(({ chartType, isEditingDashboardChart }) => {
    const [isOpen, setIsOpen] = useState(false);

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
                shadow="lg"
                size={410}
                styles={(theme) => ({
                    header: {
                        borderBottom: `1px solid ${theme.colors.gray[4]}`,
                        borderTop: `1px solid ${theme.colors.gray[2]}`,
                    },
                    inner: {
                        marginTop: isEditingDashboardChart ? '35px' : '130px',
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
});
export default VisualizationSidebar;

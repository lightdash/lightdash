import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    MantineProvider,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { themeOverride } from '../../../components/VisualizationConfigs/mantineTheme';
import { useAppSelector } from '../store/hooks';
import { BarChartConfig } from './BarChartConfiguration';
import TableVisConfiguration from './TableVisConfiguration';
import { VisualizationSwitcher } from './VisualizationSwitcher';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const RightSidebar: FC<Props> = ({ setSidebarOpen }) => {
    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Stack h="100vh">
                <Group position="apart">
                    <Title order={5} fz="sm" c="gray.6">
                        Configuration
                    </Title>
                    <Tooltip variant="xs" label="Close sidebar" position="left">
                        <ActionIcon size="xs">
                            <MantineIcon
                                icon={IconLayoutSidebarRightCollapse}
                                onClick={() => setSidebarOpen(false)}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <Config>
                    <Config.Section>
                        <Config.Heading>Chart type</Config.Heading>
                        <VisualizationSwitcher />
                    </Config.Section>
                </Config>

                {selectedChartType === ChartKind.TABLE && (
                    <TableVisConfiguration />
                )}
                {selectedChartType === ChartKind.VERTICAL_BAR && (
                    <BarChartConfig />
                )}
            </Stack>
        </MantineProvider>
    );
};

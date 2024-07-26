import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    MantineProvider,
    SegmentedControl,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { themeOverride } from '../../../components/VisualizationConfigs/mantineTheme';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedChartType } from '../store/sqlRunnerSlice';
import { BarChartConfig } from './BarChartConfiguration';
import TableVisConfiguration from './TableVisConfiguration';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const RightSidebar: FC<Props> = ({ setSidebarOpen }) => {
    const dispatch = useAppDispatch();

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Stack h="100vh" spacing="xs">
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

                <SegmentedControl
                    size="xs"
                    value={selectedChartType}
                    onChange={(value: ChartKind) =>
                        dispatch(setSelectedChartType(value))
                    }
                    data={[
                        { value: ChartKind.TABLE, label: 'Table' },
                        { value: ChartKind.VERTICAL_BAR, label: 'Bar chart' },
                    ]}
                />

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

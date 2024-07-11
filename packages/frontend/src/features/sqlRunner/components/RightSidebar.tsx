import { SqlRunnerChartType } from '@lightdash/common/src/types/visualizations';
import {
    ActionIcon,
    Group,
    SegmentedControl,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    setSelectedChartType,
    updateChartAxisLabel,
    updateChartSeriesLabel,
    updateResultsTableFieldConfigLabel,
} from '../store/sqlRunnerSlice';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const RightSidebar: FC<Props> = ({ setSidebarOpen }) => {
    const dispatch = useAppDispatch();
    const resultsTableConfig = useAppSelector(
        (state) => state.sqlRunner.resultsTableConfig,
    );
    const chartConfig = useAppSelector((state) => state.sqlRunner.chartConfig);
    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    return (
        <Stack h="100vh" spacing="xs">
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    Configure Chart
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
                onChange={(value: SqlRunnerChartType) =>
                    dispatch(setSelectedChartType(value))
                }
                data={[
                    { value: SqlRunnerChartType.TABLE, label: 'Table' },
                    { value: SqlRunnerChartType.BAR, label: 'Bar chart' },
                ]}
            />

            {resultsTableConfig &&
                selectedChartType === SqlRunnerChartType.TABLE && (
                    <Stack spacing="xs">
                        {Object.keys(resultsTableConfig.columns).map(
                            (reference) => (
                                <EditableText
                                    key={reference}
                                    value={
                                        resultsTableConfig.columns[reference]
                                            .label
                                    }
                                    onChange={(e) => {
                                        dispatch(
                                            updateResultsTableFieldConfigLabel({
                                                reference: reference,
                                                label: e.target.value,
                                            }),
                                        );
                                    }}
                                />
                            ),
                        )}
                    </Stack>
                )}
            {chartConfig && selectedChartType === SqlRunnerChartType.BAR && (
                <Stack spacing="xs">
                    <Title order={6} fz="sm" c="gray.6">
                        X axis
                    </Title>
                    <EditableText
                        value={chartConfig?.axes?.x.label}
                        onChange={(e) => {
                            dispatch(
                                updateChartAxisLabel({
                                    reference: chartConfig.axes.x.reference,
                                    label: e.target.value,
                                }),
                            );
                        }}
                    />
                    <Title order={6} fz="sm" c="gray.6">
                        Y axis
                    </Title>
                    <EditableText
                        value={chartConfig?.axes?.y[0]?.label}
                        onChange={(e) => {
                            dispatch(
                                updateChartAxisLabel({
                                    reference: chartConfig.axes.y[0].reference,
                                    label: e.target.value,
                                }),
                            );
                        }}
                    />
                    <Title order={6} fz="sm" c="gray.6">
                        Series
                    </Title>
                    {chartConfig.series.map(({ reference }, index) => (
                        <EditableText
                            key={reference}
                            value={chartConfig.axes.y[index].label}
                            onChange={(e) => {
                                dispatch(
                                    updateChartSeriesLabel({
                                        index: index,
                                        label: e.target.value,
                                    }),
                                );
                            }}
                        />
                    ))}
                </Stack>
            )}
        </Stack>
    );
};

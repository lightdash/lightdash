import { ChartKind } from '@lightdash/common';
import { ActionIcon, Group, Paper, Title, Tooltip } from '@mantine/core';
import { IconDeviceFloppy, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useUpdateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleModal } from '../store/sqlRunnerSlice';
import { SaveSqlChartModal } from './SaveSqlChartModal';

export const Header: FC = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const savedChartUuid = useAppSelector(
        (state) => state.sqlRunner.savedChartUuid,
    );
    const name = useAppSelector((state) => state.sqlRunner.name);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const config = useAppSelector((state) =>
        state.sqlRunner.selectedChartType === ChartKind.TABLE
            ? state.sqlRunner.tableChartConfig
            : state.sqlRunner.barChartConfig,
    );
    const { mutate } = useUpdateSqlChartMutation(
        projectUuid,
        savedChartUuid || '',
    );
    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
                <Group position="apart">
                    <Title order={2} c="gray.6">
                        {name}
                    </Title>
                    <Group spacing="md">
                        <Tooltip
                            variant="xs"
                            label="Save chart"
                            position="bottom"
                        >
                            <ActionIcon size="xs">
                                <MantineIcon
                                    icon={IconDeviceFloppy}
                                    onClick={() => {
                                        if (savedChartUuid) {
                                            if (config && sql) {
                                                mutate({
                                                    versionedData: {
                                                        config,
                                                        sql,
                                                    },
                                                });
                                            }
                                        } else {
                                            dispatch(
                                                toggleModal('saveChartModal'),
                                            );
                                        }
                                    }}
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            variant="xs"
                            label="Share URL"
                            position="bottom"
                        >
                            <ActionIcon size="xs">
                                <MantineIcon icon={IconLink} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal />
        </>
    );
};

import { ChartKind } from '@lightdash/common';
import { ActionIcon, Group, Paper, Tooltip } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import { useUpdateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DEFAULT_NAME, toggleModal, updateName } from '../store/sqlRunnerSlice';
import { SaveSqlChartModal } from './SaveSqlChartModal';
import ShareSqlLinkButton from './ShareSqlLinkButton';

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

    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const onCloseSaveModal = useCallback(() => {
        dispatch(toggleModal('saveChartModal'));
    }, [dispatch]);

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="xs" withBorder>
                <Group position="apart">
                    <EditableText
                        size="lg"
                        placeholder={DEFAULT_NAME}
                        value={name}
                        w={400}
                        onChange={(e) =>
                            dispatch(updateName(e.currentTarget.value))
                        }
                    />
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
                                <ShareSqlLinkButton />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />
        </>
    );
};

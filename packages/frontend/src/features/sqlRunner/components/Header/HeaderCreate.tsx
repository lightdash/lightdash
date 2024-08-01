import { ActionIcon, Group, Paper, Tooltip } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    DEFAULT_NAME,
    toggleModal,
    updateName,
} from '../../store/sqlRunnerSlice';
import { SaveSqlChartModal } from '../SaveSqlChartModal';

export const HeaderCreate: FC = () => {
    const dispatch = useAppDispatch();
    const name = useAppSelector((state) => state.sqlRunner.name);
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
                    <Group spacing="two">
                        <EditableText
                            size="md"
                            w={400}
                            placeholder={DEFAULT_NAME}
                            value={name}
                            onChange={(e) =>
                                dispatch(updateName(e.currentTarget.value))
                            }
                        />
                    </Group>
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
                                        dispatch(toggleModal('saveChartModal'));
                                    }}
                                />
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

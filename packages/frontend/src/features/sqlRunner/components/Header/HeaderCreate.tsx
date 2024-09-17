import { FeatureFlags } from '@lightdash/common';
import { Button, Group, Paper, Tooltip } from '@mantine/core';
import { IconWand } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    DEFAULT_NAME,
    toggleModal,
    updateName,
} from '../../store/sqlRunnerSlice';
import { SaveCustomExploreModal } from '../SaveCustomExploreModal';
import { SaveSqlChartModal } from '../SaveSqlChartModal';

export const HeaderCreate: FC = () => {
    const isSaveCustomExploreFromSqlRunnerEnabled = useFeatureFlagEnabled(
        FeatureFlags.SaveCustomExploreFromSqlRunner,
    );
    const dispatch = useAppDispatch();
    const name = useAppSelector((state) => state.sqlRunner.name);
    const loadedColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const isSaveCustomExploreModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveCustomExploreModal.isOpen,
    );
    const onCloseSaveModal = useCallback(() => {
        dispatch(toggleModal('saveChartModal'));
    }, [dispatch]);
    const onCloseSaveCustomExploreModal = useCallback(() => {
        dispatch(toggleModal('saveCustomExploreModal'));
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

                    <Group>
                        {isSaveCustomExploreFromSqlRunnerEnabled && (
                            <Tooltip
                                label="You can save your query as a custom explore for future use"
                                position="bottom"
                                withArrow
                                variant="xs"
                            >
                                <Button
                                    radius="md"
                                    color="indigo.6"
                                    variant="light"
                                    size="xs"
                                    leftIcon={
                                        <MantineIcon
                                            size={12}
                                            icon={IconWand}
                                        />
                                    }
                                    onClick={() => {
                                        dispatch(
                                            toggleModal(
                                                'saveCustomExploreModal',
                                            ),
                                        );
                                    }}
                                    disabled={!loadedColumns}
                                >
                                    Save explore
                                </Button>
                            </Tooltip>
                        )}

                        <Button
                            color={'green.7'}
                            size="xs"
                            disabled={!loadedColumns}
                            onClick={() => {
                                dispatch(toggleModal('saveChartModal'));
                            }}
                        >
                            Save
                        </Button>
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />
            <SaveCustomExploreModal
                key={`${isSaveCustomExploreModalOpen}-saveCustomExploreModal`}
                opened={isSaveCustomExploreModalOpen}
                onClose={onCloseSaveCustomExploreModal}
            />
        </>
    );
};

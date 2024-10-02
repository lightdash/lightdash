import { FeatureFlags } from '@lightdash/common';
import { Button, Group, Paper, Tooltip } from '@mantine/core';
import { IconDeviceFloppy, IconWriting } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { cartesianChartSelectors } from '../../../../components/DataViz/store/selectors';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    DEFAULT_NAME,
    EditorTabs,
    setActiveEditorTab,
    toggleModal,
    updateName,
} from '../../store/sqlRunnerSlice';
import { ChartErrorsAlert } from '../ChartErrorsAlert';
import { SaveCustomViewModal } from '../SaveCustomViewModal';
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
    const isSaveCustomViewModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveCustomViewModal.isOpen,
    );
    const isChartErrorsAlertOpen = useAppSelector(
        (state) => state.sqlRunner.modals.chartErrorsAlert.isOpen,
    );
    const onCloseSaveModal = useCallback(() => {
        dispatch(toggleModal('saveChartModal'));
    }, [dispatch]);
    const onCloseSaveCustomViewModal = useCallback(() => {
        dispatch(toggleModal('saveCustomViewModal'));
    }, [dispatch]);

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const hasErrors = useAppSelector(
        (state) =>
            !!cartesianChartSelectors.getErrors(state, selectedChartType),
    );

    const onSaveClick = useCallback(() => {
        if (hasErrors) {
            dispatch(toggleModal('chartErrorsAlert'));
        } else {
            dispatch(toggleModal('saveChartModal'));
        }
    }, [dispatch, hasErrors]);
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
                                    color="indigo.6"
                                    variant="light"
                                    size="xs"
                                    leftIcon={
                                        <MantineIcon
                                            size={12}
                                            icon={IconWriting}
                                        />
                                    }
                                    onClick={() => {
                                        dispatch(
                                            toggleModal('saveCustomViewModal'),
                                        );
                                    }}
                                    disabled={!loadedColumns}
                                >
                                    Create custom view
                                </Button>
                            </Tooltip>
                        )}

                        <Button
                            variant="default"
                            size="xs"
                            leftIcon={<MantineIcon icon={IconDeviceFloppy} />}
                            disabled={!loadedColumns}
                            onClick={onSaveClick}
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
            <SaveCustomViewModal
                key={`${isSaveCustomViewModalOpen}-saveCustomViewModal`}
                opened={isSaveCustomViewModalOpen}
                onClose={onCloseSaveCustomViewModal}
            />
            <ChartErrorsAlert
                opened={isChartErrorsAlertOpen}
                onClose={() => {
                    dispatch(toggleModal('chartErrorsAlert'));
                }}
                onFixButtonClick={() => {
                    dispatch(toggleModal('chartErrorsAlert'));
                    dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
                }}
            />
        </>
    );
};

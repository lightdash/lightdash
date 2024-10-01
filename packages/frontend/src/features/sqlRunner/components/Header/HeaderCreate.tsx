import { FeatureFlags } from '@lightdash/common';
import { Button, Group, Menu, Paper, Stack, Text } from '@mantine/core';
import {
    IconBrandGithub,
    IconChevronDown,
    IconDeviceFloppy,
    IconTableAlias,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
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
import { CreateVirtualViewModal } from '../CreateVirtualViewModal';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { WriteBackToDbtModal } from '../WriteBackToDbtModal';

type CtaAction = 'save' | 'createVirtualView' | 'writeBackToDbt';

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
    const isCreateVirtualViewModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.createVirtualViewModal.isOpen,
    );
    const isWriteBackToDbtModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.writeBackToDbtModal.isOpen,
    );
    const isChartErrorsAlertOpen = useAppSelector(
        (state) => state.sqlRunner.modals.chartErrorsAlert.isOpen,
    );
    const onCloseSaveModal = useCallback(() => {
        dispatch(toggleModal('saveChartModal'));
    }, [dispatch]);
    const onCloseCreateVirtualViewModal = useCallback(() => {
        dispatch(toggleModal('createVirtualViewModal'));
    }, [dispatch]);
    const onCloseWriteBackToDbtModal = useCallback(() => {
        dispatch(toggleModal('writeBackToDbtModal'));
    }, [dispatch]);

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const hasErrors = useAppSelector(
        (state) =>
            !!cartesianChartSelectors.getErrors(state, selectedChartType),
    );

    const [ctaAction, setCtaAction] = useState<CtaAction>('save');

    const handleCtaClick = useCallback(() => {
        switch (ctaAction) {
            case 'save':
                if (hasErrors) {
                    dispatch(toggleModal('chartErrorsAlert'));
                } else {
                    dispatch(toggleModal('saveChartModal'));
                }
                break;
            case 'createVirtualView':
                dispatch(toggleModal('createVirtualViewModal'));
                break;
            case 'writeBackToDbt':
                dispatch(toggleModal('writeBackToDbtModal'));
                break;
        }
    }, [ctaAction, dispatch, hasErrors]);

    const getCtaLabel = useCallback((action: CtaAction) => {
        switch (action) {
            case 'save':
                return 'Save';
            case 'createVirtualView':
                return 'Create virtual view';
            case 'writeBackToDbt':
                return 'Write back to dbt';
        }
    }, []);

    const getCtaIcon = useCallback((action: CtaAction) => {
        switch (action) {
            case 'save':
                return <MantineIcon icon={IconDeviceFloppy} />;
            case 'createVirtualView':
                return <MantineIcon icon={IconTableAlias} />;
            case 'writeBackToDbt':
                return <MantineIcon icon={IconBrandGithub} />;
        }
    }, []);

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
                        <Button.Group>
                            <Button
                                variant="default"
                                size="xs"
                                leftIcon={getCtaIcon(ctaAction)}
                                disabled={!loadedColumns}
                                onClick={handleCtaClick}
                            >
                                {getCtaLabel(ctaAction)}
                            </Button>
                            {isSaveCustomExploreFromSqlRunnerEnabled && (
                                <Menu
                                    withinPortal
                                    disabled={!loadedColumns}
                                    position="bottom-end"
                                    withArrow
                                    shadow="md"
                                    offset={2}
                                    arrowOffset={10}
                                >
                                    <Menu.Target>
                                        <Button
                                            size="xs"
                                            p={4}
                                            disabled={!loadedColumns}
                                            variant="default"
                                        >
                                            <MantineIcon
                                                icon={IconChevronDown}
                                                size="sm"
                                            />
                                        </Button>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        <Menu.Item>
                                            <Stack
                                                spacing="two"
                                                onClick={() => {
                                                    setCtaAction('save');
                                                }}
                                            >
                                                <Text fz="xs" fw={600}>
                                                    Save chart
                                                </Text>
                                                <Text fz={10} c="gray.6">
                                                    {getCtaLabel('save')}
                                                </Text>
                                            </Stack>
                                        </Menu.Item>

                                        <Menu.Item>
                                            <Stack
                                                spacing="two"
                                                onClick={() => {
                                                    setCtaAction(
                                                        'createVirtualView',
                                                    );
                                                }}
                                            >
                                                <Text fw={600} fz="xs">
                                                    {getCtaLabel(
                                                        'createVirtualView',
                                                    )}
                                                </Text>
                                                <Text fz={10} c="gray.6">
                                                    Save as a reusable query
                                                </Text>
                                            </Stack>
                                        </Menu.Item>

                                        <Menu.Item>
                                            <Stack
                                                spacing="two"
                                                onClick={() => {
                                                    setCtaAction(
                                                        'writeBackToDbt',
                                                    );
                                                }}
                                            >
                                                <Text fw={600} fz="xs">
                                                    {getCtaLabel(
                                                        'writeBackToDbt',
                                                    )}
                                                </Text>
                                                <Text fz={10} c="gray.6">
                                                    Save as model in dbt
                                                </Text>
                                            </Stack>
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                        </Button.Group>
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />
            <CreateVirtualViewModal
                key={`${isCreateVirtualViewModalOpen}-createVirtualViewModal`}
                opened={isCreateVirtualViewModalOpen}
                onClose={onCloseCreateVirtualViewModal}
            />
            <WriteBackToDbtModal
                key={`${isWriteBackToDbtModalOpen}-writeBackToDbtModal`}
                opened={isWriteBackToDbtModalOpen}
                onClose={onCloseWriteBackToDbtModal}
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

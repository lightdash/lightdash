import { DbtProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import {
    IconBrandGithub,
    IconChevronDown,
    IconDeviceFloppy,
    IconLink,
    IconTableAlias,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { cartesianChartSelectors } from '../../../../components/DataViz/store/selectors';
import { useGitHubRepositories } from '../../../../components/UserSettings/GithubSettingsPanel';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import useHealth from '../../../../hooks/health/useHealth';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useProject } from '../../../../hooks/useProject';
import { useCreateShareMutation } from '../../../../hooks/useShare';
import { CreateVirtualViewModal } from '../../../virtualView';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    DEFAULT_NAME,
    EditorTabs,
    setActiveEditorTab,
    toggleModal,
    updateName,
} from '../../store/sqlRunnerSlice';
import { ChartErrorsAlert } from '../ChartErrorsAlert';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { WriteBackToDbtModal } from '../WriteBackToDbtModal';

type CtaAction = 'save' | 'createVirtualView' | 'writeBackToDbt';

export const HeaderCreate: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);

    const dispatch = useAppDispatch();
    const name = useAppSelector((state) => state.sqlRunner.name);
    const loadedColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const health = useHealth();
    const sqlRunnerState = useAppSelector((state) => state.sqlRunner);
    const { mutateAsync: createShareUrl } = useCreateShareMutation();

    const isGithubIntegrationEnabled =
        health?.data?.hasGithub &&
        project?.dbtConnection.type === DbtProjectType.GITHUB;
    const { isError: githubIsNotInstalled } = useGitHubRepositories();

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

    const getCtaLabels = useCallback((action: CtaAction) => {
        switch (action) {
            case 'save':
                return {
                    label: 'Save chart',
                    description: 'Save as an adhoc query',
                };
            case 'createVirtualView':
                return {
                    label: 'Create virtual view',
                    description: 'Save as a reusable query',
                };
            case 'writeBackToDbt':
                return {
                    label: 'Write back to dbt',
                    description: 'Save as a model in dbt',
                };
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
    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();

    const handleCreateShareUrl = useCallback(async () => {
        const path = window.location.pathname;
        const shareUrl = await createShareUrl({
            path,
            params: JSON.stringify(sqlRunnerState),
        });
        const fullUrl = `${window.location.origin}${window.location.pathname}?share=${shareUrl.nanoid}`;
        clipboard.copy(fullUrl);
        showToastSuccess({ title: 'Shared URL copied to clipboard!' });
    }, [createShareUrl, sqlRunnerState, clipboard, showToastSuccess]);

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
                                {getCtaLabels(ctaAction).label}
                            </Button>
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
                                    <Menu.Item
                                        onClick={() => {
                                            setCtaAction('save');
                                        }}
                                    >
                                        <Stack spacing="two">
                                            <Text
                                                fz="xs"
                                                fw={600}
                                                c={
                                                    ctaAction === 'save'
                                                        ? 'blue'
                                                        : undefined
                                                }
                                            >
                                                {getCtaLabels('save').label}
                                            </Text>
                                            <Text fz={10} c="gray.6">
                                                {
                                                    getCtaLabels('save')
                                                        .description
                                                }
                                            </Text>
                                        </Stack>
                                    </Menu.Item>

                                    <Menu.Item
                                        onClick={() => {
                                            setCtaAction('createVirtualView');
                                        }}
                                    >
                                        <Stack spacing="two">
                                            <Text
                                                fw={600}
                                                fz="xs"
                                                c={
                                                    ctaAction ===
                                                    'createVirtualView'
                                                        ? 'blue'
                                                        : undefined
                                                }
                                            >
                                                {
                                                    getCtaLabels(
                                                        'createVirtualView',
                                                    ).label
                                                }
                                            </Text>
                                            <Text fz={10} c="gray.6">
                                                {
                                                    getCtaLabels(
                                                        'createVirtualView',
                                                    ).description
                                                }
                                            </Text>
                                        </Stack>
                                    </Menu.Item>

                                    {isGithubIntegrationEnabled && (
                                        <Tooltip
                                            label={
                                                'Please enable Github integration to write back to dbt in Settings > Integrations > Github'
                                            }
                                            position="top"
                                            withArrow
                                            withinPortal
                                            disabled={!githubIsNotInstalled}
                                        >
                                            <Group>
                                                <Menu.Item
                                                    disabled={
                                                        githubIsNotInstalled
                                                    }
                                                    onClick={() => {
                                                        setCtaAction(
                                                            'writeBackToDbt',
                                                        );
                                                    }}
                                                >
                                                    <Stack spacing="two">
                                                        <Text
                                                            fw={600}
                                                            fz="xs"
                                                            c={
                                                                ctaAction ===
                                                                'writeBackToDbt'
                                                                    ? 'blue'
                                                                    : undefined
                                                            }
                                                        >
                                                            {
                                                                getCtaLabels(
                                                                    'writeBackToDbt',
                                                                ).label
                                                            }
                                                        </Text>
                                                        <Text
                                                            fz={10}
                                                            c="gray.6"
                                                        >
                                                            {
                                                                getCtaLabels(
                                                                    'writeBackToDbt',
                                                                ).description
                                                            }
                                                        </Text>
                                                    </Stack>
                                                </Menu.Item>
                                            </Group>
                                        </Tooltip>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        </Button.Group>
                        <ActionIcon
                            variant="default"
                            onClick={handleCreateShareUrl}
                        >
                            <MantineIcon icon={IconLink} />
                        </ActionIcon>
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

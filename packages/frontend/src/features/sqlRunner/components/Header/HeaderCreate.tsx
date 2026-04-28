import { subject } from '@casl/ability';
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
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { cartesianChartSelectors } from '../../../../components/DataViz/store/selectors';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import { useGitIntegration } from '../../../../hooks/gitIntegration/useGitIntegration';
import useHealth from '../../../../hooks/health/useHealth';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import { CreateVirtualViewModal } from '../../../virtualView';
import { useCreateSqlRunnerShareUrl } from '../../hooks/useSqlRunnerShareUrl';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    toggleModal,
    updateName,
} from '../../store/sqlRunnerSlice';
import { ChartErrorsAlert } from '../ChartErrorsAlert';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { WriteBackToDbtModal } from '../WriteBackToDbtModal';

type CtaAction = 'save' | 'createVirtualView' | 'writeBackToDbt';

const DEFAULT_SQL_NAME = 'Untitled SQL query';
const DEFAULT_NAME_VIRTUAL_VIEW = 'Untitled virtual view';

export const HeaderCreate: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);

    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;

    const canSaveChart = !!user.data?.ability?.can(
        'manage',
        subject('CustomSql', { organizationUuid, projectUuid }),
    );
    const canCreateVirtualView = !!user.data?.ability?.can(
        'create',
        subject('VirtualView', { organizationUuid, projectUuid }),
    );
    const canWriteBackToDbt = !!user.data?.ability?.can(
        'manage',
        subject('SourceCode', { organizationUuid, projectUuid }),
    );

    const dispatch = useAppDispatch();
    const name = useAppSelector((state) => state.sqlRunner.name);
    const loadedColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const health = useHealth();
    const { data: gitIntegration } = useGitIntegration();

    const [writeBackDisabledMessage, writeBackOpenUrl] = useMemo(() => {
        if (!canWriteBackToDbt) {
            return [
                "You don't have permission to write back to dbt in this project.",
                undefined,
            ];
        }
        const hasGithubEnabled = gitIntegration?.enabled;
        const hasGitProject = [
            DbtProjectType.GITHUB,
            DbtProjectType.GITLAB,
        ].includes(project?.dbtConnection.type as DbtProjectType);
        const hasGithubIntegration = health?.data?.hasGithub;

        if (!hasGithubIntegration) {
            return [
                'Github integration is not enabled on this instance, click here to see more details ',
                'https://docs.lightdash.com/self-host/customize-deployment/environment-variables#github-integration',
            ];
        }
        if (!hasGithubEnabled) {
            return [
                `Github integration is not active on this organization, click here to open integrations page`,
                `${health?.data?.siteUrl}/generalSettings/integrations`,
            ];
        }
        if (!hasGitProject) {
            return [
                <Text key="writeBackDisabledMessage">
                    This project{' '}
                    <Text span fw={600}>
                        {project?.name}
                    </Text>{' '}
                    is not connected to a GitHub or GitLab repository, click
                    here to open project settings page
                </Text>,
                `${health?.data?.siteUrl}/generalSettings/projectManagement/${projectUuid}/settings`,
            ];
        }
        return [undefined, undefined];
    }, [
        canWriteBackToDbt,
        gitIntegration?.enabled,
        health?.data?.hasGithub,
        health?.data?.siteUrl,
        project?.dbtConnection.type,
        project?.name,
        projectUuid,
    ]);

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

    const initialCtaAction: CtaAction = canSaveChart
        ? 'save'
        : canCreateVirtualView
          ? 'createVirtualView'
          : canWriteBackToDbt
            ? 'writeBackToDbt'
            : 'save';
    const [ctaAction, setCtaAction] = useState<CtaAction>(initialCtaAction);

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

    const untitledName = useMemo(() => {
        if (ctaAction === 'createVirtualView') {
            return DEFAULT_NAME_VIRTUAL_VIEW;
        }
        return DEFAULT_SQL_NAME;
    }, [ctaAction]);

    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();
    const createShareUrl = useCreateSqlRunnerShareUrl();

    const handleCreateShareUrl = useCallback(async () => {
        const fullUrl = await createShareUrl();
        clipboard.copy(fullUrl);
        showToastSuccess({ title: 'Shared URL copied to clipboard!' });
    }, [createShareUrl, clipboard, showToastSuccess]);

    const isCtaDisabled =
        !loadedColumns ||
        (ctaAction === 'save' && !canSaveChart) ||
        (ctaAction === 'createVirtualView' && !canCreateVirtualView) ||
        (ctaAction === 'writeBackToDbt' && !canWriteBackToDbt);

    const hasAnyAction =
        canSaveChart || canCreateVirtualView || canWriteBackToDbt;

    return (
        <>
            <Paper
                shadow="none"
                radius={0}
                withBorder={false}
                px="md"
                py="xs"
                sx={(theme) => ({
                    borderBottom: `1px solid ${
                        theme.colorScheme === 'dark'
                            ? theme.colors.ldDark[8]
                            : theme.colors.ldGray[3]
                    }`,
                })}
            >
                <Group position="apart">
                    {hasAnyAction && (
                        <Group spacing="two">
                            <EditableText
                                size="md"
                                w={400}
                                placeholder={untitledName}
                                value={name}
                                onChange={(e) =>
                                    dispatch(updateName(e.currentTarget.value))
                                }
                            />
                        </Group>
                    )}

                    <Group spacing="xs">
                        {hasAnyAction && (
                            <Button.Group>
                                <Button
                                    variant="default"
                                    size="xs"
                                    leftIcon={getCtaIcon(ctaAction)}
                                    disabled={isCtaDisabled}
                                    onClick={handleCtaClick}
                                >
                                    {getCtaLabels(ctaAction).label}
                                </Button>
                                <Menu
                                    withinPortal
                                    disabled={!loadedColumns || !hasAnyAction}
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
                                            disabled={
                                                !loadedColumns || !hasAnyAction
                                            }
                                            variant="default"
                                        >
                                            <MantineIcon
                                                icon={IconChevronDown}
                                                size="sm"
                                            />
                                        </Button>
                                    </Menu.Target>

                                    <Menu.Dropdown>
                                        <Tooltip
                                            label="You don't have permission to save SQL charts in this project."
                                            multiline
                                            maw={400}
                                            position="top"
                                            withArrow
                                            withinPortal
                                            disabled={canSaveChart}
                                        >
                                            <Group
                                                sx={{
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <Menu.Item
                                                    disabled={!canSaveChart}
                                                    onClick={() => {
                                                        setCtaAction('save');
                                                    }}
                                                >
                                                    <Stack spacing="two">
                                                        <Text
                                                            fz="xs"
                                                            fw={600}
                                                            c={
                                                                ctaAction ===
                                                                    'save' &&
                                                                canSaveChart
                                                                    ? 'blue'
                                                                    : undefined
                                                            }
                                                        >
                                                            {
                                                                getCtaLabels(
                                                                    'save',
                                                                ).label
                                                            }
                                                        </Text>
                                                        <Text
                                                            fz={10}
                                                            c="ldGray.6"
                                                        >
                                                            {
                                                                getCtaLabels(
                                                                    'save',
                                                                ).description
                                                            }
                                                        </Text>
                                                    </Stack>
                                                </Menu.Item>
                                            </Group>
                                        </Tooltip>

                                        <Tooltip
                                            label="You don't have permission to create virtual views in this project."
                                            multiline
                                            maw={400}
                                            position="top"
                                            withArrow
                                            withinPortal
                                            disabled={canCreateVirtualView}
                                        >
                                            <Group
                                                sx={{
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <Menu.Item
                                                    disabled={
                                                        !canCreateVirtualView
                                                    }
                                                    onClick={() => {
                                                        setCtaAction(
                                                            'createVirtualView',
                                                        );
                                                    }}
                                                >
                                                    <Stack spacing="two">
                                                        <Text
                                                            fw={600}
                                                            fz="xs"
                                                            c={
                                                                ctaAction ===
                                                                    'createVirtualView' &&
                                                                canCreateVirtualView
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
                                                        <Text
                                                            fz={10}
                                                            c="ldGray.6"
                                                        >
                                                            {
                                                                getCtaLabels(
                                                                    'createVirtualView',
                                                                ).description
                                                            }
                                                        </Text>
                                                    </Stack>
                                                </Menu.Item>
                                            </Group>
                                        </Tooltip>

                                        <Tooltip
                                            label={writeBackDisabledMessage}
                                            multiline
                                            maw={400}
                                            position="top"
                                            withArrow
                                            withinPortal
                                            disabled={
                                                writeBackDisabledMessage ===
                                                undefined
                                            }
                                            onClick={() => {
                                                if (writeBackOpenUrl)
                                                    window.open(
                                                        writeBackOpenUrl,
                                                        '_blank',
                                                    );
                                            }}
                                        >
                                            <Group
                                                sx={{
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <Menu.Item
                                                    disabled={
                                                        writeBackDisabledMessage !==
                                                        undefined
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
                                                                    'writeBackToDbt' &&
                                                                canWriteBackToDbt
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
                                                            c="ldGray.6"
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
                                    </Menu.Dropdown>
                                </Menu>
                            </Button.Group>
                        )}
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

import { subject } from '@casl/ability';
import { DbtProjectType } from '@lightdash/common';
import {
    Group,
    Stack,
    Text,
    Button,
    ActionIcon,
    Menu,
    Tooltip,
} from '@mantine/core';
import { useClipboard, useHotkeys } from '@mantine/hooks';
import {
    IconGitPullRequest,
    IconChevronDown,
    IconDeviceFloppy,
    IconLink,
    IconTableAlias,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import { cartesianChartSelectors } from '../../../../components/DataViz/store/selectors';
import { useGitIntegration } from '../../../../hooks/gitIntegration/useGitIntegration';
import useHealth from '../../../../hooks/health/useHealth';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useProject } from '../../../../hooks/useProject';
import useCreateInAnySpaceAccess from '../../../../hooks/user/useCreateInAnySpaceAccess';
import useApp from '../../../../providers/App/useApp';
import { CreateVirtualViewModal } from '../../../virtualView';
import { useCreateSqlRunnerShareUrl } from '../../hooks/useSqlRunnerShareUrl';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    toggleModal,
} from '../../store/sqlRunnerSlice';
import { isBitbucketCloudConnection } from '../../utils/isBitbucketCloudConnection';
import { ChartErrorsAlert } from '../ChartErrorsAlert';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { WriteBackToDbtModal } from '../WriteBackToDbtModal';
import classes from './HeaderCreate.module.css';

type CtaAction = 'save' | 'createVirtualView' | 'writeBackToDbt';

/** Anchor for scope walkthroughs (data-tour-via): the Save chart button. */
const saveChartAnchor = {
    'data-tour-anchor': 'sql-save-chart',
    'data-tour-hint': 'Click Save chart',
};
/** The same button once Create virtual view is the chosen action. */
const virtualViewAnchor = {
    'data-tour-anchor': 'sql-create-virtual-view',
    'data-tour-hint': 'Click Create virtual view',
};

export const HeaderCreate: FC = () => {
    const { t } = useTranslation('sqlRunner');
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);

    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;

    // Saving a SQL chart needs both the project-level CustomSql permission and
    // create access to at least one space (matches the backend SavedChart check).
    const canManageCustomSql = !!user.data?.ability?.can(
        'manage',
        subject('CustomSql', { organizationUuid, projectUuid }),
    );
    const canCreateChartInSpace = useCreateInAnySpaceAccess(
        projectUuid,
        'SavedChart',
    );
    const canSaveChart = canManageCustomSql && canCreateChartInSpace;
    const canCreateVirtualView = !!user.data?.ability?.can(
        'create',
        subject('VirtualView', { organizationUuid, projectUuid }),
    );
    const canWriteBackToDbt = !!user.data?.ability?.can(
        'manage',
        subject('SourceCode', {
            organizationUuid,
            projectUuid,
            isProtectedBranch: false,
        }),
    );

    const dispatch = useAppDispatch();
    const loadedColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );
    // Saving captures the query as it last ran, so the editor must match that run
    const needsRun = !loadedColumns || hasUnrunChanges || !sql?.trim();
    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const health = useHealth();
    const { data: gitIntegration } = useGitIntegration();

    const [writeBackDisabledMessage, writeBackOpenUrl] = useMemo(() => {
        if (!canWriteBackToDbt) {
            return [t('header.writeBack.noPermission'), undefined];
        }
        if (
            project?.dbtConnection.type === DbtProjectType.GITHUB &&
            project.dbtConnection.semanticLayer === 'lightdash'
        ) {
            return [t('header.writeBack.onlyDbtProjects'), undefined];
        }
        if (project?.dbtConnection.type === DbtProjectType.BITBUCKET) {
            return isBitbucketCloudConnection(project.dbtConnection)
                ? [undefined, undefined]
                : [
                      t('header.writeBack.bitbucketCloudOnly'),
                      `${health?.data?.siteUrl}/generalSettings/projectManagement/${projectUuid}/settings`,
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
                t('header.writeBack.githubNotEnabled'),
                'https://docs.lightdash.com/self-host/customize-deployment/environment-variables#github-integration',
            ];
        }
        if (!hasGithubEnabled) {
            return [
                t('header.writeBack.githubNotActive'),
                `${health?.data?.siteUrl}/generalSettings/integrations`,
            ];
        }
        if (!hasGitProject) {
            return [
                <Text key="writeBackDisabledMessage">
                    <Trans
                        t={t}
                        i18nKey="header.writeBack.notConnectedToRepo"
                        values={{ projectName: project?.name }}
                        components={{ project: <Text span fw={600} /> }}
                    />
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
        project?.dbtConnection,
        project?.name,
        projectUuid,
        t,
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

    // The default depends on permissions that resolve asynchronously
    // (canSaveChart waits on the spaces query), so derive it during render and
    // only override it once the user explicitly picks an action.
    const [userSelectedCtaAction, setUserSelectedCtaAction] =
        useState<CtaAction | null>(null);
    const defaultCtaAction: CtaAction = canSaveChart
        ? 'save'
        : canCreateVirtualView
          ? 'createVirtualView'
          : canWriteBackToDbt
            ? 'writeBackToDbt'
            : 'save';
    // Ignore a stale selection if the user no longer has permission for it
    // (permissions can change after the spaces query resolves).
    const isUserSelectedActionValid =
        (userSelectedCtaAction === 'save' && canSaveChart) ||
        (userSelectedCtaAction === 'createVirtualView' &&
            canCreateVirtualView) ||
        (userSelectedCtaAction === 'writeBackToDbt' && canWriteBackToDbt);
    const ctaAction = isUserSelectedActionValid
        ? (userSelectedCtaAction ?? defaultCtaAction)
        : defaultCtaAction;

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

    const getCtaLabels = useCallback(
        (action: CtaAction) => {
            switch (action) {
                case 'save':
                    return {
                        label: t('header.cta.saveChart'),
                        description: t('header.cta.saveChartDescription'),
                    };
                case 'createVirtualView':
                    return {
                        label: t('header.cta.createVirtualView'),
                        description: t(
                            'header.cta.createVirtualViewDescription',
                        ),
                    };
                case 'writeBackToDbt':
                    return {
                        label: t('header.cta.writeBackToDbt'),
                        description: t('header.cta.writeBackToDbtDescription'),
                    };
            }
        },
        [t],
    );

    const getCtaIcon = useCallback((action: CtaAction) => {
        switch (action) {
            case 'save':
                return <MantineIcon icon={IconDeviceFloppy} />;
            case 'createVirtualView':
                return <MantineIcon icon={IconTableAlias} />;
            case 'writeBackToDbt':
                return <MantineIcon icon={IconGitPullRequest} />;
        }
    }, []);

    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();
    const createShareUrl = useCreateSqlRunnerShareUrl();

    const handleCreateShareUrl = useCallback(async () => {
        const fullUrl = await createShareUrl();
        clipboard.copy(fullUrl);
        showToastSuccess({ title: t('header.shareUrlCopied') });
    }, [createShareUrl, clipboard, showToastSuccess, t]);

    const isCtaDisabled =
        needsRun ||
        (ctaAction === 'save' && !canSaveChart) ||
        (ctaAction === 'createVirtualView' && !canCreateVirtualView) ||
        (ctaAction === 'writeBackToDbt' &&
            (!canWriteBackToDbt || writeBackDisabledMessage !== undefined));

    const hasAnyAction =
        canSaveChart || canCreateVirtualView || canWriteBackToDbt;

    const isAnyModalOpen =
        isSaveModalOpen ||
        isCreateVirtualViewModalOpen ||
        isWriteBackToDbtModalOpen ||
        isChartErrorsAlertOpen;

    // Save on cmd/ctrl + s, including while the SQL editor is focused
    useHotkeys(
        [
            [
                'mod+s',
                () => {
                    if (!isCtaDisabled && !isAnyModalOpen) handleCtaClick();
                },
            ],
        ],
        [],
    );

    return (
        <>
            <Group gap="xs" wrap="nowrap">
                {hasAnyAction && (
                    <Tooltip label={t('header.runToSave')} disabled={!needsRun}>
                        <Button.Group>
                            <Button
                                variant="default"
                                size="xs"
                                leftSection={getCtaIcon(ctaAction)}
                                disabled={isCtaDisabled}
                                onClick={handleCtaClick}
                                {...(ctaAction === 'save'
                                    ? saveChartAnchor
                                    : ctaAction === 'createVirtualView'
                                      ? virtualViewAnchor
                                      : {})}
                            >
                                {getCtaLabels(ctaAction).label}
                            </Button>
                            <Menu
                                disabled={needsRun || !hasAnyAction}
                                position="bottom-end"
                                withArrow
                                offset={2}
                                arrowOffset={10}
                            >
                                <Menu.Target>
                                    <Button
                                        size="xs"
                                        p={4}
                                        disabled={needsRun || !hasAnyAction}
                                        variant="default"
                                        // Anchor for scope walkthroughs (data-tour-via)
                                        data-tour-anchor="sql-cta-menu"
                                        data-tour-hint="Open the save options"
                                    >
                                        <MantineIcon
                                            icon={IconChevronDown}
                                            size="sm"
                                        />
                                    </Button>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <Tooltip
                                        label={t('header.noSavePermission')}
                                        maw={400}
                                        position="top"
                                        disabled={canSaveChart}
                                    >
                                        <Group className={classes.menuOption}>
                                            <Menu.Item
                                                disabled={!canSaveChart}
                                                onClick={() => {
                                                    setUserSelectedCtaAction(
                                                        'save',
                                                    );
                                                }}
                                            >
                                                <Stack gap="two">
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
                                                            getCtaLabels('save')
                                                                .label
                                                        }
                                                    </Text>
                                                    <Text fz="xs" c="dimmed">
                                                        {
                                                            getCtaLabels('save')
                                                                .description
                                                        }
                                                    </Text>
                                                </Stack>
                                            </Menu.Item>
                                        </Group>
                                    </Tooltip>

                                    <Tooltip
                                        label={t(
                                            'header.noVirtualViewPermission',
                                        )}
                                        maw={400}
                                        position="top"
                                        disabled={canCreateVirtualView}
                                    >
                                        <Group className={classes.menuOption}>
                                            <Menu.Item
                                                disabled={!canCreateVirtualView}
                                                onClick={() => {
                                                    setUserSelectedCtaAction(
                                                        'createVirtualView',
                                                    );
                                                }}
                                                // Anchor for scope walkthroughs (data-tour-via)
                                                data-tour-anchor="sql-cta-virtual-view"
                                                data-tour-hint="Choose Create virtual view"
                                            >
                                                <Stack gap="two">
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
                                                    <Text fz="xs" c="dimmed">
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
                                        maw={400}
                                        position="top"
                                        disabled={
                                            writeBackDisabledMessage ===
                                            undefined
                                        }
                                        onClick={() => {
                                            if (writeBackOpenUrl)
                                                window.open(
                                                    writeBackOpenUrl,
                                                    '_blank',
                                                    'noopener,noreferrer',
                                                );
                                        }}
                                    >
                                        <Group className={classes.menuOption}>
                                            <Menu.Item
                                                disabled={
                                                    writeBackDisabledMessage !==
                                                    undefined
                                                }
                                                onClick={() => {
                                                    setUserSelectedCtaAction(
                                                        'writeBackToDbt',
                                                    );
                                                }}
                                            >
                                                <Stack gap="two">
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
                                                    <Text fz="xs" c="dimmed">
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
                    </Tooltip>
                )}
                <Tooltip label={t('header.copyLink')}>
                    <ActionIcon
                        variant="default"
                        aria-label={t('header.copyLink')}
                        onClick={handleCreateShareUrl}
                    >
                        <MantineIcon icon={IconLink} />
                    </ActionIcon>
                </Tooltip>
            </Group>
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

import { subject } from '@casl/ability';
import { FeatureFlags, formatTimestamp, TimeFrames } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Flex,
    Menu,
    NavLink,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconDots,
    IconHistory,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import AgentAttribution from '../components/common/AgentAttribution/AgentAttribution';
import Callout from '../components/common/Callout';
import { EmptyState } from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import MantineModal from '../components/common/MantineModal';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import {
    useDashboardHistory,
    useDashboardQuery,
    useDashboardVersionRollbackMutation,
} from '../hooks/dashboard/useDashboard';
import { useContentAuthoringEnabled } from '../hooks/useContentAuthoringEnabled';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import NoTableIcon from '../svgs/emptystate-no-table.svg?react';
import DashboardVersionComparison from './DashboardVersionComparison';

const DashboardHistory = () => {
    const { t } = useTranslation('pages');
    const agentIdentityEnabled =
        useServerFeatureFlag(FeatureFlags.AgentIdentity).data?.enabled === true;
    const authoringEnabled = useContentAuthoringEnabled();
    const navigate = useNavigate();
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const { dashboardUuid: routeDashboardIdentifier } = useParams<{
        dashboardUuid: string;
    }>();
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const [selectedVersionUuid, setSelectedVersionUuid] = useState<string>();

    const dashboardQuery = useDashboardQuery({
        uuidOrSlug: routeDashboardIdentifier,
        projectUuid,
    });
    const dashboardUuid = dashboardQuery.data?.uuid;
    const dashboardIdentifier =
        dashboardQuery.data?.slug ?? routeDashboardIdentifier;
    const historyQuery = useDashboardHistory(dashboardUuid);

    const rollbackMutation = useDashboardVersionRollbackMutation(dashboardUuid);

    if (historyQuery.isInitialLoading || dashboardQuery.isInitialLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title={t('common.loading')} loading />
            </div>
        );
    }
    if (historyQuery.error || dashboardQuery.error) {
        return (
            <ErrorState
                error={historyQuery.error?.error || dashboardQuery.error?.error}
            />
        );
    }

    const history = historyQuery.data?.history ?? [];

    return (
        <Page
            title={t('dashboardHistory.title')}
            sidebarTitle={t('versionHistory.versions', { ns: 'app' })}
            withSidebarFooter
            withFullHeight
            withPaddedContent
            sidebar={
                <Stack
                    gap="xl"
                    mah="100%"
                    style={{ overflowY: 'hidden', flex: 1 }}
                >
                    <Flex gap="xs">
                        <PageBreadcrumbs
                            items={[
                                {
                                    title: t('dashboardHistory.dashboard'),
                                    to: `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}`,
                                },
                                {
                                    title: t('common.versionHistory'),
                                    active: true,
                                },
                            ]}
                        />
                    </Flex>
                    <Stack gap="xs" style={{ flexGrow: 1, overflowY: 'auto' }}>
                        {history.map((version, index) => (
                            <NavLink
                                key={version.versionUuid}
                                active={
                                    version.versionUuid === selectedVersionUuid
                                }
                                leftSection={
                                    <MantineIcon icon={IconLayoutDashboard} />
                                }
                                label={formatTimestamp(
                                    version.createdAt,
                                    TimeFrames.SECOND,
                                )}
                                description={
                                    agentIdentityEnabled &&
                                    version.agentIdentity ? (
                                        <AgentAttribution
                                            claim={version.agentIdentity}
                                            createdBy={version.createdBy}
                                        />
                                    ) : version.createdBy ? (
                                        t('versionHistory.updatedBy', {
                                            ns: 'app',
                                            name: `${version.createdBy.firstName} ${version.createdBy.lastName}`,
                                        })
                                    ) : (
                                        t('dashboardHistory.updatedByUnknown')
                                    )
                                }
                                rightSection={
                                    <>
                                        {index === 0 && (
                                            <Tooltip
                                                label={t(
                                                    'versionHistory.currentTooltip',
                                                    { ns: 'app' },
                                                )}
                                            >
                                                <Badge size="xs" color="green">
                                                    {t(
                                                        'versionHistory.current',
                                                        { ns: 'app' },
                                                    )}
                                                </Badge>
                                            </Tooltip>
                                        )}
                                        {index !== 0 &&
                                            version.versionUuid ===
                                                selectedVersionUuid && (
                                                <Can
                                                    I="manage"
                                                    this={subject('Dashboard', {
                                                        ...dashboardQuery.data,
                                                    })}
                                                >
                                                    <Menu
                                                        position="bottom-start"
                                                        withArrow
                                                        arrowPosition="center"
                                                        offset={-4}
                                                        closeOnItemClick
                                                        closeOnClickOutside
                                                    >
                                                        <Menu.Target>
                                                            <ActionIcon
                                                                display={
                                                                    authoringEnabled
                                                                        ? undefined
                                                                        : 'none'
                                                                }
                                                            >
                                                                <IconDots
                                                                    size={16}
                                                                />
                                                            </ActionIcon>
                                                        </Menu.Target>

                                                        <Menu.Dropdown
                                                            maw={320}
                                                        >
                                                            <Menu.Item
                                                                component="button"
                                                                role="menuitem"
                                                                leftSection={
                                                                    <IconHistory
                                                                        size={
                                                                            18
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() => {
                                                                    setIsRollbackModalOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                            >
                                                                {t(
                                                                    'versionHistory.restoreThisVersion',
                                                                    {
                                                                        ns: 'app',
                                                                    },
                                                                )}
                                                            </Menu.Item>
                                                        </Menu.Dropdown>
                                                    </Menu>
                                                </Can>
                                            )}
                                    </>
                                }
                                onClick={() =>
                                    setSelectedVersionUuid(version.versionUuid)
                                }
                            />
                        ))}
                    </Stack>
                </Stack>
            }
        >
            {selectedVersionUuid ? (
                <DashboardVersionComparison
                    dashboard={dashboardQuery.data}
                    dashboardUuid={dashboardUuid}
                    projectUuid={projectUuid}
                    versionUuid={selectedVersionUuid}
                />
            ) : (
                <EmptyState
                    maw={500}
                    icon={<NoTableIcon />}
                    title={t('dashboardHistory.selectVersion')}
                />
            )}

            <MantineModal
                opened={isRollbackModalOpen}
                onClose={() => setIsRollbackModalOpen(false)}
                title={t('dashboardHistory.restoreTitle')}
                icon={IconHistory}
                cancelDisabled={rollbackMutation.isLoading}
                actions={
                    <Button
                        loading={rollbackMutation.isLoading}
                        onClick={() => {
                            if (selectedVersionUuid) {
                                rollbackMutation.mutate(selectedVersionUuid, {
                                    onSuccess: () => {
                                        setIsRollbackModalOpen(false);
                                        void navigate(
                                            `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}`,
                                        );
                                    },
                                });
                            }
                        }}
                        color="red"
                    >
                        {t('versionHistory.restore', { ns: 'app' })}
                    </Button>
                }
            >
                <Stack gap="md">
                    <Text>{t('dashboardHistory.restoreDescription')}</Text>
                    <Callout variant="info">
                        <Text size="sm">
                            {t('dashboardHistory.restoreChartsNote')}
                        </Text>
                    </Callout>
                </Stack>
            </MantineModal>
        </Page>
    );
};

export default DashboardHistory;

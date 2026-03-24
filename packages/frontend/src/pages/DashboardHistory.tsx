import { subject } from '@casl/ability';
import {
    formatTimestamp,
    isDashboardChartTileType,
    TimeFrames,
} from '@lightdash/common';
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
} from '@mantine-8/core';
import {
    IconChartBar,
    IconDots,
    IconHistory,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
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
import { Can } from '../providers/Ability';
import NoTableIcon from '../svgs/emptystate-no-table.svg?react';
import DashboardVersionComparison from './DashboardVersionComparison';

const DashboardHistory = () => {
    const navigate = useNavigate();
    const { dashboardUuid, projectUuid } = useParams<{
        dashboardUuid: string;
        projectUuid: string;
    }>();
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const [selectedVersionUuid, setSelectedVersionUuid] = useState<string>();

    const dashboardQuery = useDashboardQuery({
        uuidOrSlug: dashboardUuid,
        projectUuid,
    });
    const historyQuery = useDashboardHistory(dashboardUuid);

    const rollbackMutation = useDashboardVersionRollbackMutation(dashboardUuid);

    // Count the number of charts in the dashboard
    // Must be before early returns to maintain hook order
    const chartCount = useMemo(() => {
        if (!dashboardQuery.data?.tiles) return 0;
        return dashboardQuery.data.tiles.filter(
            (tile) =>
                isDashboardChartTileType(tile) &&
                tile.properties.savedChartUuid,
        ).length;
    }, [dashboardQuery.data?.tiles]);

    if (historyQuery.isInitialLoading || dashboardQuery.isInitialLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
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
            title="Dashboard version history"
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
                                    title: 'Dashboard',
                                    to: `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                                },
                                { title: 'Version history', active: true },
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
                                    version.createdBy
                                        ? `Updated by: ${version.createdBy.firstName} ${version.createdBy.lastName}`
                                        : 'Updated by: unknown'
                                }
                                rightSection={
                                    <>
                                        {index === 0 && (
                                            <Tooltip label="This is the current version.">
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color="green"
                                                >
                                                    current
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
                                                        withinPortal
                                                        position="bottom-start"
                                                        withArrow
                                                        arrowPosition="center"
                                                        shadow="md"
                                                        offset={-4}
                                                        closeOnItemClick
                                                        closeOnClickOutside
                                                    >
                                                        <Menu.Target>
                                                            <ActionIcon variant="subtle">
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
                                                                Restore this
                                                                version
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
                    dashboardUuid={dashboardUuid}
                    projectUuid={projectUuid}
                    versionUuid={selectedVersionUuid}
                />
            ) : (
                <EmptyState
                    maw={500}
                    icon={<NoTableIcon />}
                    title="Select a version to compare"
                />
            )}

            <MantineModal
                opened={isRollbackModalOpen}
                onClose={() => setIsRollbackModalOpen(false)}
                title="Restore dashboard version"
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
                                            `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                                        );
                                    },
                                });
                            }
                        }}
                        color="red"
                    >
                        Restore
                    </Button>
                }
            >
                <Stack gap="md">
                    <Text>
                        By restoring to this dashboard version, a new version
                        will be generated and saved. All previous versions are
                        still safely stored and can be restored at any time.
                    </Text>
                    {chartCount > 0 && (
                        <Callout variant="info">
                            <Stack gap="xs">
                                <Flex align="center" gap="xs">
                                    <MantineIcon
                                        icon={IconChartBar}
                                        size="sm"
                                    />
                                    <Text size="sm" fw={600}>
                                        Complete restoration including charts
                                    </Text>
                                </Flex>
                                <Text size="sm">
                                    This restoration will include all{' '}
                                    {chartCount} chart
                                    {chartCount !== 1 ? 's' : ''}
                                    in the dashboard. Each chart will be
                                    restored to its exact state at the time this
                                    dashboard version was created, ensuring a
                                    complete point-in-time recovery.
                                </Text>
                            </Stack>
                        </Callout>
                    )}
                </Stack>
            </MantineModal>
        </Page>
    );
};

export default DashboardHistory;

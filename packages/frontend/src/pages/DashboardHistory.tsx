import { subject } from '@casl/ability';
import { formatTimestamp, TimeFrames } from '@lightdash/common';
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
    IconDots,
    IconHistory,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
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

const DashboardHistory = () => {
    const navigate = useNavigate();
    const { dashboardUuid, projectUuid } = useParams<{
        dashboardUuid: string;
        projectUuid: string;
    }>();
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const [selectedVersionUuid, setSelectedVersionUuid] = useState<string>();

    const dashboardQuery = useDashboardQuery(dashboardUuid);
    const historyQuery = useDashboardHistory(dashboardUuid);

    const rollbackMutation = useDashboardVersionRollbackMutation(dashboardUuid);

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
            withFullHeight
            withPaddedContent
        >
            <Stack gap="lg" maw={600}>
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

                <Text fw={600} size="lg">
                    {dashboardQuery.data?.name}
                </Text>

                <Stack gap="xs">
                    {history.map((version, index) => (
                        <NavLink
                            key={version.versionUuid}
                            active={version.versionUuid === selectedVersionUuid}
                            leftSection={
                                <MantineIcon icon={IconLayoutDashboard} />
                            }
                            label={formatTimestamp(
                                version.createdAt,
                                TimeFrames.SECOND,
                            )}
                            description={
                                <Text>
                                    {version.createdBy
                                        ? `Updated by: ${version.createdBy.firstName} ${version.createdBy.lastName}`
                                        : 'Updated by: unknown'}
                                    {' \u00B7 '}
                                    {version.tileCount} tile
                                    {version.tileCount !== 1 ? 's' : ''}
                                    {version.tabCount > 0 &&
                                        `, ${version.tabCount} tab${version.tabCount !== 1 ? 's' : ''}`}
                                </Text>
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

                                                    <Menu.Dropdown maw={320}>
                                                        <Menu.Item
                                                            component="button"
                                                            role="menuitem"
                                                            leftSection={
                                                                <IconHistory
                                                                    size={18}
                                                                />
                                                            }
                                                            onClick={() => {
                                                                setIsRollbackModalOpen(
                                                                    true,
                                                                );
                                                            }}
                                                        >
                                                            Restore this version
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
                <Text>
                    By restoring to this dashboard version, a new version will
                    be generated and saved. All previous versions are still
                    safely stored and can be restored at any time.
                </Text>
            </MantineModal>
        </Page>
    );
};

export default DashboardHistory;

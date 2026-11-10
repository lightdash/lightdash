import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import {
    useAnalyticsProject,
    useCreateAnalyticsProject,
    useDeleteAnalyticsProject,
    useInstallAnalyticsSampleContent,
} from '../../hooks/organization/useAnalyticsProject';
import { useDeleteActiveProjectMutation } from '../../hooks/useActiveProject';
import Callout from '../common/Callout';
import EmptyStateLoader from '../common/EmptyStateLoader';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { SettingRow, SettingsSection } from '../common/Settings/SettingLayout';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { SettingsPage } from '../common/Settings/SettingsPage';
import AnalyticsDashboardCard from './AnalyticsDashboardCard';
import AnalyticsHistoryBackfill from './AnalyticsHistoryBackfill';
import AnalyticsProcessingSummary from './AnalyticsProcessingSummary';

const LightdashAnalyticsPanel = ({
    activeProjectUuid,
}: {
    activeProjectUuid?: string;
}) => {
    const status = useAnalyticsProject();
    const createProject = useCreateAnalyticsProject();
    const deleteProject = useDeleteAnalyticsProject();
    const installSampleContent = useInstallAnalyticsSampleContent();
    const { mutate: clearActiveProject } = useDeleteActiveProjectMutation();
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const analyticsProject = status.data?.project;
    const dashboards = useDashboards(
        analyticsProject?.projectUuid,
        { enabled: status.isSuccess, refetchOnMount: 'always' },
        true,
    );

    return (
        <SettingsPage
            title="Lightdash analytics"
            description="Explore your organization's AI usage and query activity."
        >
            {status.isLoading ? (
                <SettingsCard>
                    <EmptyStateLoader title="Loading analytics project" />
                </SettingsCard>
            ) : status.isError ? (
                <SettingsCard>
                    <Stack gap="md">
                        <Callout
                            variant="danger"
                            title="Unable to load analytics project"
                        >
                            {status.error.error.message}
                        </Callout>
                        <Group>
                            <Button
                                variant="default"
                                onClick={() => void status.refetch()}
                            >
                                Retry
                            </Button>
                        </Group>
                    </Stack>
                </SettingsCard>
            ) : (
                <SettingsSection
                    label="Analytics project"
                    description="A dedicated project with built-in AI usage and query event models."
                >
                    <SettingsCard>
                        {analyticsProject ? (
                            <SettingRow
                                title="Your analytics project"
                                description="Open your dedicated project to explore AI usage and query events."
                                control={
                                    <Group gap="xs">
                                        {analyticsProject.hasContentUpdates !==
                                            false && (
                                            <Tooltip
                                                events={{
                                                    hover: true,
                                                    focus: true,
                                                    touch: true,
                                                }}
                                                label={`${analyticsProject.hasContentUpdates ? 'New analytics content is available. Sync to update your models and dashboards. ' : ''}Updates built-in dashboards and charts, replacing edits to them. Custom dashboards and copies are kept. Duplicate built-in dashboards to keep your edits.`}
                                            >
                                                <Button
                                                    variant="default"
                                                    rightSection={
                                                        analyticsProject.hasContentUpdates ? (
                                                            <MantineIcon
                                                                icon={
                                                                    IconSparkles
                                                                }
                                                                color="blue"
                                                                aria-hidden={
                                                                    false
                                                                }
                                                                role="img"
                                                                aria-label="New analytics content available"
                                                            />
                                                        ) : undefined
                                                    }
                                                    loading={
                                                        installSampleContent.isLoading
                                                    }
                                                    onClick={() =>
                                                        installSampleContent.mutate()
                                                    }
                                                >
                                                    Sync content
                                                </Button>
                                            </Tooltip>
                                        )}
                                        <Button
                                            component={Link}
                                            to={analyticsProject.url}
                                        >
                                            Explore
                                        </Button>
                                    </Group>
                                }
                            >
                                <Stack gap="sm" mt="sm">
                                    <AnalyticsProcessingSummary
                                        processing={analyticsProject.processing}
                                    />
                                    {installSampleContent.isError && (
                                        <Callout
                                            variant="danger"
                                            title="Unable to sync analytics content"
                                        >
                                            {
                                                installSampleContent.error.error
                                                    .message
                                            }
                                        </Callout>
                                    )}
                                </Stack>
                            </SettingRow>
                        ) : (
                            <SettingRow
                                title="Create your analytics project"
                                description="Create a dedicated project with built-in AI usage and query event models. No connection setup is needed. Dashboard data for the last seven complete days is prepared first, then older events are added in the background. This can take a few minutes, or longer for larger histories."
                                control={
                                    <Button
                                        loading={createProject.isLoading}
                                        onClick={() => createProject.mutate()}
                                    >
                                        Create
                                    </Button>
                                }
                            >
                                {createProject.isError && (
                                    <Box mt="sm">
                                        <Callout
                                            variant="danger"
                                            title="Unable to create analytics project"
                                        >
                                            {createProject.error.error.message}
                                        </Callout>
                                    </Box>
                                )}
                            </SettingRow>
                        )}
                    </SettingsCard>
                </SettingsSection>
            )}
            {status.isSuccess && analyticsProject && (
                <SettingsSection
                    label="Dashboards"
                    description={null}
                    titleAddon={
                        dashboards.isSuccess && (
                            <Badge size="sm">{dashboards.data.length}</Badge>
                        )
                    }
                >
                    {dashboards.isLoading ? (
                        <EmptyStateLoader title="Loading dashboards" />
                    ) : dashboards.isError ? (
                        <Callout
                            variant="danger"
                            title="Unable to load dashboards"
                        >
                            {dashboards.error.error.message}
                        </Callout>
                    ) : dashboards.data?.length ? (
                        <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
                            {dashboards.data.map((dashboard) => (
                                <AnalyticsDashboardCard
                                    key={dashboard.uuid}
                                    dashboard={dashboard}
                                    projectUrlIdentifier={
                                        analyticsProject.slug ??
                                        analyticsProject.projectUuid
                                    }
                                />
                            ))}
                        </SimpleGrid>
                    ) : (
                        <Paper variant="dotted" p="lg">
                            <Text fz="sm" c="dimmed" ta="center">
                                No dashboards yet. Save a dashboard in your
                                analytics project, then reload this page to see
                                it here.
                            </Text>
                        </Paper>
                    )}
                </SettingsSection>
            )}
            {status.isSuccess && analyticsProject && (
                <AnalyticsHistoryBackfill />
            )}
            {status.isSuccess && analyticsProject && (
                <SettingsSection label="Danger zone" description={null}>
                    <SettingsCard>
                        <SettingRow
                            title="Delete analytics project"
                            description="Permanently delete the analytics project and its saved charts and dashboards. Collected usage events are kept."
                            control={
                                <Button
                                    variant="outline"
                                    color="red"
                                    onClick={() => {
                                        deleteProject.reset();
                                        setDeleteTarget(
                                            analyticsProject.projectUuid,
                                        );
                                    }}
                                >
                                    Delete
                                </Button>
                            }
                        />
                    </SettingsCard>
                </SettingsSection>
            )}
            <MantineModal
                opened={deleteTarget !== null}
                onClose={() => {
                    if (!deleteProject.isLoading) setDeleteTarget(null);
                }}
                title="Delete analytics project?"
                variant="delete"
                description="This permanently deletes the analytics project and its saved charts and dashboards. The collected usage events in storage are not deleted. You can create a new analytics project afterwards."
                confirmLoading={deleteProject.isLoading}
                onConfirm={() => {
                    if (deleteTarget)
                        deleteProject.mutate(deleteTarget, {
                            onSuccess: () => {
                                if (deleteTarget === activeProjectUuid)
                                    clearActiveProject();
                                setDeleteTarget(null);
                                createProject.reset();
                            },
                        });
                }}
            >
                {deleteProject.isError && (
                    <Callout
                        variant="danger"
                        title="Unable to delete analytics project"
                    >
                        {deleteProject.error.error.message}
                    </Callout>
                )}
            </MantineModal>
        </SettingsPage>
    );
};

export default LightdashAnalyticsPanel;

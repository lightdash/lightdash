import {
    Accordion,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useProjectAiAgentButtonVisibility } from '../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import {
    useAnalyticsProject,
    useCreateAnalyticsProject,
    useDeleteAnalyticsProject,
} from '../../hooks/organization/useAnalyticsProject';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useDeleteActiveProjectMutation } from '../../hooks/useActiveProject';
import { useAnalyticsProjectView } from '../../hooks/useAnalyticsProjectView';
import Callout from '../common/Callout';
import EmptyStateLoader from '../common/EmptyStateLoader';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { SettingRow, SettingsSection } from '../common/Settings/SettingLayout';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { AnalyticsAskAiButton } from './AnalyticsAskAiButton';
import AnalyticsDashboardCard from './AnalyticsDashboardCard';
import AnalyticsHistoryBackfill from './AnalyticsHistoryBackfill';
import AnalyticsOverview from './AnalyticsOverview/AnalyticsOverview';
import AnalyticsProcessingSummary from './AnalyticsProcessingSummary';

const LightdashAnalyticsPanel = ({
    activeProjectUuid,
}: {
    activeProjectUuid?: string;
}) => {
    const status = useAnalyticsProject();
    const createProject = useCreateAnalyticsProject();
    const deleteProject = useDeleteAnalyticsProject();
    const { mutate: clearActiveProject } = useDeleteActiveProjectMutation();
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const analyticsProject = status.data?.project;
    const { data: organization } = useOrganization();
    useAnalyticsProjectView(
        status.isSuccess && organization
            ? {
                  organizationId: organization.organizationUuid,
                  projectUuid: analyticsProject?.projectUuid ?? null,
                  source: 'settings',
              }
            : null,
    );
    const projectUrlIdentifier = analyticsProject
        ? (analyticsProject.slug ?? analyticsProject.projectUuid)
        : null;
    const canAskAi = useProjectAiAgentButtonVisibility(
        analyticsProject?.projectUuid,
    );
    const dashboards = useDashboards(
        analyticsProject?.projectUuid,
        { enabled: status.isSuccess, refetchOnMount: 'always' },
        true,
    );
    const verifiedDashboards =
        dashboards.data?.filter((dashboard) => dashboard.verification) ?? [];
    const showOverview =
        status.isSuccess && analyticsProject && projectUrlIdentifier;
    const heading = (
        <Stack gap="xs">
            <Title order={1}>Usage analytics</Title>
            <Text fz="sm" c="dimmed">
                Track adoption and usage.
            </Text>
            {showOverview && (
                <AnalyticsProcessingSummary
                    processing={analyticsProject.processing}
                    compact
                />
            )}
        </Stack>
    );

    return (
        <Stack gap="lg" pb="lg">
            {!showOverview && heading}
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
            ) : analyticsProject && projectUrlIdentifier ? (
                <AnalyticsOverview
                    projectUuid={analyticsProject.projectUuid}
                    projectUrlIdentifier={projectUrlIdentifier}
                    dashboards={verifiedDashboards}
                    heading={heading}
                    actions={
                        <Group gap="sm" wrap="nowrap">
                            {canAskAi && (
                                <AnalyticsAskAiButton
                                    projectUuid={analyticsProject.projectUuid}
                                />
                            )}
                            <Button
                                component={Link}
                                variant="default"
                                size="xs"
                                to={`/projects/${projectUrlIdentifier}/tables`}
                                leftSection={<MantineIcon icon={IconPlus} />}
                            >
                                Create your own
                            </Button>
                        </Group>
                    }
                />
            ) : (
                <SettingsCard>
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
                </SettingsCard>
            )}
            {status.isSuccess && projectUrlIdentifier && (
                <Accordion variant="separated">
                    <Accordion.Item value="dashboards">
                        <Accordion.Control>
                            <Group gap="xs">
                                <Text fz="sm">Verified dashboards</Text>
                                {dashboards.isSuccess && (
                                    <Badge size="sm">
                                        {verifiedDashboards.length}
                                    </Badge>
                                )}
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            {dashboards.isLoading ? (
                                <EmptyStateLoader title="Loading dashboards" />
                            ) : dashboards.isError ? (
                                <Callout
                                    variant="danger"
                                    title="Unable to load dashboards"
                                >
                                    {dashboards.error.error.message}
                                </Callout>
                            ) : verifiedDashboards.length ? (
                                <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>
                                    {verifiedDashboards.map((dashboard) => (
                                        <AnalyticsDashboardCard
                                            key={dashboard.uuid}
                                            dashboard={dashboard}
                                            projectUrlIdentifier={
                                                projectUrlIdentifier
                                            }
                                        />
                                    ))}
                                </SimpleGrid>
                            ) : (
                                <Paper variant="dotted" p="lg">
                                    <Text fz="sm" c="dimmed" ta="center">
                                        No verified dashboards yet.
                                    </Text>
                                </Paper>
                            )}
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
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
        </Stack>
    );
};

export default LightdashAnalyticsPanel;

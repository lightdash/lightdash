import {
    Anchor,
    Button,
    Divider,
    Group,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { SettingsCard } from '../common/Settings/SettingsCard';
import { SettingsPage } from '../common/Settings/SettingsPage';

const LightdashAnalyticsPanel = ({
    activeProjectUuid,
}: {
    activeProjectUuid?: string;
}) => {
    const { t } = useTranslation('userSettings');
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
            title={t('lightdashAnalyticsPanel.title')}
            isBeta
            description={t('lightdashAnalyticsPanel.description')}
        >
            <SettingsCard>
                {status.isLoading ? (
                    <EmptyStateLoader
                        title={t('lightdashAnalyticsPanel.loadingProject')}
                    />
                ) : status.isError ? (
                    <Stack gap="md">
                        <Callout
                            variant="danger"
                            title={t(
                                'lightdashAnalyticsPanel.errors.loadProject',
                            )}
                        >
                            {status.error.error.message}
                        </Callout>
                        <Group>
                            <Button
                                variant="default"
                                onClick={() => void status.refetch()}
                            >
                                {t('actions.retry', { ns: 'common' })}
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Stack gap="md">
                        <Stack gap="xs">
                            <Title order={5}>
                                {analyticsProject
                                    ? t('lightdashAnalyticsPanel.project.title')
                                    : t(
                                          'lightdashAnalyticsPanel.project.createTitle',
                                      )}
                            </Title>
                            <Text fz="sm" c="dimmed">
                                {analyticsProject
                                    ? t(
                                          'lightdashAnalyticsPanel.project.description',
                                      )
                                    : t(
                                          'lightdashAnalyticsPanel.project.createDescription',
                                      )}
                            </Text>
                        </Stack>
                        {analyticsProject && (
                            <Text fz="xs" c="dimmed">
                                {t(
                                    'lightdashAnalyticsPanel.project.createdAt',
                                    {
                                        date: new Date(
                                            analyticsProject.createdAt,
                                        ).toLocaleString(),
                                    },
                                )}
                            </Text>
                        )}
                        {createProject.isError && (
                            <Callout
                                variant="danger"
                                title={t(
                                    'lightdashAnalyticsPanel.errors.createProject',
                                )}
                            >
                                {createProject.error.error.message}
                            </Callout>
                        )}
                        <Group>
                            {analyticsProject ? (
                                <>
                                    <Button
                                        component={Link}
                                        to={analyticsProject.url}
                                    >
                                        {t(
                                            'lightdashAnalyticsPanel.actions.explore',
                                        )}
                                    </Button>
                                    {analyticsProject.hasContentUpdates !==
                                        false && (
                                        <Tooltip
                                            events={{
                                                hover: true,
                                                focus: true,
                                                touch: true,
                                            }}
                                            label={
                                                analyticsProject.hasContentUpdates
                                                    ? t(
                                                          'lightdashAnalyticsPanel.sync.tooltipWithUpdates',
                                                      )
                                                    : t(
                                                          'lightdashAnalyticsPanel.sync.tooltip',
                                                      )
                                            }
                                        >
                                            <Button
                                                variant="default"
                                                rightSection={
                                                    analyticsProject.hasContentUpdates ? (
                                                        <MantineIcon
                                                            icon={IconSparkles}
                                                            color="blue"
                                                            aria-hidden={false}
                                                            role="img"
                                                            aria-label={t(
                                                                'lightdashAnalyticsPanel.sync.newContentAriaLabel',
                                                            )}
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
                                                {t(
                                                    'lightdashAnalyticsPanel.sync.button',
                                                )}
                                            </Button>
                                        </Tooltip>
                                    )}
                                    <Button
                                        variant="subtle"
                                        color="red"
                                        onClick={() => {
                                            deleteProject.reset();
                                            setDeleteTarget(
                                                analyticsProject.projectUuid,
                                            );
                                        }}
                                    >
                                        {t('actions.delete', {
                                            ns: 'common',
                                        })}
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    loading={createProject.isLoading}
                                    onClick={() => createProject.mutate()}
                                >
                                    {t('actions.create', { ns: 'common' })}
                                </Button>
                            )}
                        </Group>
                        {installSampleContent.isError && (
                            <Callout
                                variant="danger"
                                title={t(
                                    'lightdashAnalyticsPanel.errors.syncContent',
                                )}
                            >
                                {installSampleContent.error.error.message}
                            </Callout>
                        )}
                    </Stack>
                )}
            </SettingsCard>
            {status.isSuccess && analyticsProject && (
                <SettingsCard>
                    <Stack gap="md">
                        <Title order={5}>
                            {t('lightdashAnalyticsPanel.dashboards.title')}
                        </Title>
                        {dashboards.isLoading ? (
                            <EmptyStateLoader
                                title={t(
                                    'lightdashAnalyticsPanel.dashboards.loading',
                                )}
                            />
                        ) : dashboards.isError ? (
                            <Callout
                                variant="danger"
                                title={t(
                                    'lightdashAnalyticsPanel.errors.loadDashboards',
                                )}
                            >
                                {dashboards.error.error.message}
                            </Callout>
                        ) : dashboards.data?.length ? (
                            dashboards.data.map((dashboard, index) => (
                                <Stack key={dashboard.uuid} gap="xs">
                                    {index > 0 && <Divider />}
                                    <Anchor
                                        component={Link}
                                        to={`/projects/${analyticsProject.slug ?? analyticsProject.projectUuid}/dashboards/${dashboard.slug}/view`}
                                    >
                                        {dashboard.name}
                                    </Anchor>
                                    {dashboard.description && (
                                        <Text fz="sm" c="dimmed">
                                            {dashboard.description}
                                        </Text>
                                    )}
                                    <Text fz="xs" c="dimmed">
                                        {t(
                                            'lightdashAnalyticsPanel.dashboards.updatedAt',
                                            {
                                                date: new Date(
                                                    dashboard.updatedAt,
                                                ).toLocaleString(),
                                            },
                                        )}
                                    </Text>
                                </Stack>
                            ))
                        ) : (
                            <Text fz="sm" c="dimmed">
                                {t('lightdashAnalyticsPanel.dashboards.empty')}
                            </Text>
                        )}
                    </Stack>
                </SettingsCard>
            )}
            <MantineModal
                opened={deleteTarget !== null}
                onClose={() => {
                    if (!deleteProject.isLoading) setDeleteTarget(null);
                }}
                title={t('lightdashAnalyticsPanel.deleteModal.title')}
                variant="delete"
                description={t(
                    'lightdashAnalyticsPanel.deleteModal.description',
                )}
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
                        title={t(
                            'lightdashAnalyticsPanel.errors.deleteProject',
                        )}
                    >
                        {deleteProject.error.error.message}
                    </Callout>
                )}
            </MantineModal>
        </SettingsPage>
    );
};

export default LightdashAnalyticsPanel;

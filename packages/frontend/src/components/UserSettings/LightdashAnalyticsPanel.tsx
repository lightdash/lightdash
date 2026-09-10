import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
    useAnalyticsProject,
    useCreateAnalyticsProject,
    useDeleteAnalyticsProject,
} from '../../hooks/organization/useAnalyticsProject';
import { useDeleteActiveProjectMutation } from '../../hooks/useActiveProject';
import Callout from '../common/Callout';
import EmptyStateLoader from '../common/EmptyStateLoader';
import MantineModal from '../common/MantineModal';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { SettingsPage } from '../common/Settings/SettingsPage';

const LightdashAnalyticsPanel = ({
    activeProjectUuid,
}: {
    activeProjectUuid?: string;
}) => {
    const navigate = useNavigate();
    const status = useAnalyticsProject();
    const createProject = useCreateAnalyticsProject();
    const deleteProject = useDeleteAnalyticsProject();
    const { mutate: clearActiveProject } = useDeleteActiveProjectMutation();
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const analyticsProject = status.data?.project;

    return (
        <SettingsPage
            title="Lightdash analytics"
            isBeta
            description="Explore your organization's AI usage and query activity."
        >
            <SettingsCard>
                {status.isLoading ? (
                    <EmptyStateLoader title="Loading analytics project" />
                ) : status.isError ? (
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
                ) : (
                    <Stack gap="md">
                        <Stack gap="xs">
                            <Title order={5}>
                                {analyticsProject
                                    ? 'Your analytics project'
                                    : 'Create your analytics project'}
                            </Title>
                            <Text fz="sm" c="dimmed">
                                {analyticsProject
                                    ? 'Open your dedicated project to explore AI usage and query events.'
                                    : 'Create a dedicated project with built-in AI usage and query event models. No connection setup is needed.'}
                            </Text>
                        </Stack>
                        {analyticsProject && (
                            <Text fz="xs" c="dimmed">
                                Created{' '}
                                {new Date(
                                    analyticsProject.createdAt,
                                ).toLocaleString()}
                            </Text>
                        )}
                        {createProject.isError && (
                            <Callout
                                variant="danger"
                                title="Unable to create analytics project"
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
                                        Open
                                    </Button>
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
                                        Delete
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    loading={createProject.isLoading}
                                    onClick={() =>
                                        createProject.mutate(undefined, {
                                            onSuccess: ({ url }) =>
                                                navigate(url),
                                        })
                                    }
                                >
                                    Create
                                </Button>
                            )}
                        </Group>
                    </Stack>
                )}
            </SettingsCard>
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

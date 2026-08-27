import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconExternalLink, IconKey, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
    useDeleteLinearInstallationMutation,
    useLinearInstallation,
    useLinearProjects,
    useLinearTeams,
} from '../../../../../../components/common/LinearIntegration/hooks/useLinearIntegration';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useProjects } from '../../../../../../hooks/useProjects';
import useApp from '../../../../../../providers/App/useApp';
import {
    useClearReviewLinearDestinations,
    useReviewLinearDestination,
    useUpdateReviewLinearDestination,
} from '../../../hooks/useReviewNotificationSettings';
import { buildLinearAppSetupUrl } from './linearReviewSettingsUtils';

export const LinearReviewSettings = () => {
    const { health, user } = useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const [linearClientId, setLinearClientId] = useState('');
    const [selectedProjectUuid, setSelectedProjectUuid] = useState<
        string | null
    >(null);
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const siteUrl = health.data?.siteUrl ?? window.location.origin;

    const { data: projects = [], isInitialLoading: projectsLoading } =
        useProjects();
    useEffect(() => {
        if (!selectedProjectUuid && projects[0]) {
            setSelectedProjectUuid(projects[0].projectUuid);
        }
    }, [projects, selectedProjectUuid]);

    const linearInstallationQuery = useLinearInstallation();
    const installation = linearInstallationQuery.data;
    const hasLinear = !!installation;
    const requiresReconnect = installation?.requiresReconnect === true;
    const { data: linearTeams, isInitialLoading: linearTeamsLoading } =
        useLinearTeams({ enabled: hasLinear && !requiresReconnect });
    const destinationQuery = useReviewLinearDestination(selectedProjectUuid);
    const destination = destinationQuery.data;
    const { data: linearProjects, isInitialLoading: linearProjectsLoading } =
        useLinearProjects({
            enabled: hasLinear && !requiresReconnect,
            teamId: destination?.linearTeamId ?? null,
        });
    const { mutate: updateDestination, isLoading: destinationUpdating } =
        useUpdateReviewLinearDestination();
    const { mutate: clearDestinations, isLoading: destinationsClearing } =
        useClearReviewLinearDestinations();
    const { mutate: deleteLinear, isLoading: linearDeleting } =
        useDeleteLinearInstallationMutation();
    const isUpdating =
        destinationUpdating || destinationsClearing || linearDeleting;

    useEffect(() => {
        if (searchParams.get('linearWorkspaceChanged') !== 'true') return;
        clearDestinations(undefined, {
            onSuccess: () => {
                setSearchParams(
                    (current) => {
                        const next = new URLSearchParams(current);
                        next.delete('linearWorkspaceChanged');
                        return next;
                    },
                    { replace: true },
                );
            },
        });
    }, [clearDestinations, searchParams, setSearchParams]);

    const submitLinearOAuth = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const clientId = linearClientId.trim();
        if (!clientId) return;
        window.location.assign(
            `/api/v1/linear/install?clientId=${encodeURIComponent(clientId)}`,
        );
    };

    const setupUrl = useMemo(() => buildLinearAppSetupUrl(siteUrl), [siteUrl]);
    const saveDestination = (
        changes: Partial<{
            enabled: boolean;
            linearTeamId: string | null;
            linearProjectId: string | null;
        }>,
    ) => {
        if (!selectedProjectUuid || !destination) return;
        updateDestination({
            projectUuid: selectedProjectUuid,
            data: {
                enabled: changes.enabled ?? destination.enabled,
                linearTeamId:
                    changes.linearTeamId === undefined
                        ? destination.linearTeamId
                        : changes.linearTeamId,
                linearProjectId:
                    changes.linearProjectId === undefined
                        ? destination.linearProjectId
                        : changes.linearProjectId,
            },
        });
    };

    const oauthForm = (
        <Stack gap="xs">
            <Text c="dimmed" fz="xs">
                Create a private OAuth app with the callback already filled in,
                then paste its public client ID once. No API key or client
                secret required.
            </Text>
            <Button
                size="xs"
                variant="subtle"
                component="a"
                href={setupUrl}
                target="_blank"
                rel="noreferrer"
                rightSection={<MantineIcon icon={IconExternalLink} size={14} />}
            >
                Create Linear app
            </Button>
            <form onSubmit={submitLinearOAuth}>
                <Group gap="xs" wrap="nowrap" align="flex-end">
                    <TextInput
                        style={{ flex: 1 }}
                        size="xs"
                        label="Linear OAuth client ID"
                        value={linearClientId}
                        placeholder="Paste the client ID from Linear"
                        disabled={!canEdit || isUpdating}
                        onChange={(event) =>
                            setLinearClientId(event.currentTarget.value)
                        }
                    />
                    <Button
                        type="submit"
                        size="xs"
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            linearClientId.trim().length === 0
                        }
                    >
                        {requiresReconnect
                            ? 'Reconnect Linear'
                            : 'Connect Linear'}
                    </Button>
                </Group>
            </form>
        </Stack>
    );

    return (
        <>
            <Divider mx="calc(var(--mantine-spacing-md) * -1)" />
            <Group
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
                gap="md"
            >
                <Box maw={620}>
                    <Group gap="xs" mb={4}>
                        <Title order={6}>Linear issues</Title>
                        {hasLinear && (
                            <Badge
                                size="sm"
                                variant="light"
                                color={requiresReconnect ? 'yellow' : 'green'}
                                leftSection={
                                    <MantineIcon icon={IconKey} size={12} />
                                }
                            >
                                {requiresReconnect
                                    ? 'Reconnect required'
                                    : 'Connected'}
                            </Badge>
                        )}
                    </Group>
                    <Text c="dimmed" fz="xs">
                        Create one Linear issue for each new review finding.
                        This is a one-way export; status changes are not synced
                        back to Lightdash.
                    </Text>
                    {hasLinear && (
                        <Text c="dimmed" fz="xs" mt={4}>
                            Connected to {installation.organizationName} (
                            {installation.organizationUrlKey}). Tokens are
                            encrypted and scoped to this Lightdash organization.
                        </Text>
                    )}
                </Box>
                {linearInstallationQuery.isInitialLoading ||
                destinationQuery.isInitialLoading ? (
                    <Loader size="sm" />
                ) : (
                    <Switch
                        size="md"
                        aria-label="Create Linear issues for AI review findings"
                        checked={
                            !!destination?.enabled &&
                            hasLinear &&
                            !requiresReconnect
                        }
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !hasLinear ||
                            requiresReconnect ||
                            !destination?.linearTeamId
                        }
                        onChange={(event) =>
                            saveDestination({
                                enabled: event.currentTarget.checked,
                            })
                        }
                    />
                )}
            </Group>

            {!hasLinear || requiresReconnect ? (
                oauthForm
            ) : (
                <Group gap="xs" justify="flex-end">
                    <Button
                        size="xs"
                        variant="default"
                        component="a"
                        href="/api/v1/linear/install"
                        disabled={!canEdit || isUpdating}
                    >
                        Reconnect
                    </Button>
                    <Button
                        type="button"
                        size="xs"
                        variant="subtle"
                        color="red"
                        disabled={!canEdit || isUpdating}
                        leftSection={<MantineIcon icon={IconTrash} size={14} />}
                        onClick={() =>
                            deleteLinear(undefined, {
                                onSuccess: () => clearDestinations(),
                            })
                        }
                    >
                        Remove
                    </Button>
                </Group>
            )}

            {hasLinear && !requiresReconnect && (
                <Stack gap="sm">
                    <Select
                        label="Lightdash project"
                        placeholder={
                            projectsLoading
                                ? 'Loading projects'
                                : 'Select a project'
                        }
                        data={projects.map((project) => ({
                            value: project.projectUuid,
                            label: project.name,
                        }))}
                        value={selectedProjectUuid}
                        disabled={!canEdit || isUpdating || projectsLoading}
                        onChange={setSelectedProjectUuid}
                    />
                    <Select
                        label="Linear team"
                        placeholder={
                            linearTeamsLoading
                                ? 'Loading teams'
                                : 'Select a team'
                        }
                        data={(linearTeams ?? []).map((team) => ({
                            value: team.id,
                            label: `${team.name} (${team.key})`,
                        }))}
                        value={destination?.linearTeamId ?? null}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !selectedProjectUuid ||
                            destinationQuery.isInitialLoading ||
                            linearTeamsLoading
                        }
                        onChange={(linearTeamId) =>
                            saveDestination({
                                enabled: !!linearTeamId,
                                linearTeamId,
                                linearProjectId: null,
                            })
                        }
                    />
                    <Select
                        label="Linear project"
                        description="Optional. Issues without a project still go to the selected team."
                        placeholder={
                            linearProjectsLoading
                                ? 'Loading projects'
                                : 'Optional project'
                        }
                        data={(linearProjects ?? []).map((project) => ({
                            value: project.id,
                            label: project.name,
                        }))}
                        value={destination?.linearProjectId ?? null}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !destination?.linearTeamId ||
                            linearProjectsLoading
                        }
                        clearable
                        onChange={(linearProjectId) =>
                            saveDestination({ linearProjectId })
                        }
                    />
                </Stack>
            )}
        </>
    );
};

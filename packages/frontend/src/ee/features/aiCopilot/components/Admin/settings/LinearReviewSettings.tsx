import {
    Badge,
    Box,
    Button,
    Checkbox,
    Divider,
    Group,
    Loader,
    MultiSelect,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconExternalLink, IconKey, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
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
    useBackfillReviewLinearIssues,
    useReviewLinearRouting,
    useUpdateReviewLinearRouting,
} from '../../../hooks/useReviewNotificationSettings';
import { buildLinearAppSetupUrl } from './linearReviewSettingsUtils';

const selectOptionsWithCurrent = (
    options: Array<{ value: string; label: string }>,
    currentValue: string | null,
) => {
    if (
        !currentValue ||
        options.some((option) => option.value === currentValue)
    ) {
        return options;
    }

    return [...options, { value: currentValue, label: currentValue }];
};

export const LinearReviewSettings = () => {
    const { health, user } = useApp();
    const [linearClientId, setLinearClientId] = useState('');
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const siteUrl = health.data?.siteUrl ?? window.location.origin;

    const { data: projects = [], isInitialLoading: projectsLoading } =
        useProjects();
    const linearInstallationQuery = useLinearInstallation();
    const installation = linearInstallationQuery.data;
    const hasLinear = !!installation;
    const requiresReconnect = installation?.requiresReconnect === true;
    const { data: linearTeams, isInitialLoading: linearTeamsLoading } =
        useLinearTeams({ enabled: hasLinear && !requiresReconnect });
    const routingQuery = useReviewLinearRouting({
        enabled: hasLinear && !requiresReconnect,
    });
    const routing = routingQuery.data;
    const { data: linearProjects, isInitialLoading: linearProjectsLoading } =
        useLinearProjects({
            enabled: hasLinear && !requiresReconnect,
            teamId: routing?.linearTeamId ?? null,
        });
    const { mutate: updateRouting, isLoading: routingUpdating } =
        useUpdateReviewLinearRouting();
    const { mutate: backfillLinear, isLoading: linearBackfilling } =
        useBackfillReviewLinearIssues();
    const { mutate: deleteLinear, isLoading: linearDeleting } =
        useDeleteLinearInstallationMutation();
    const isUpdating = routingUpdating || linearDeleting || linearBackfilling;

    const submitLinearOAuth = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const clientId = linearClientId.trim();
        if (!clientId) return;
        window.location.assign(
            `/api/v1/linear/install?clientId=${encodeURIComponent(clientId)}`,
        );
    };

    const setupUrl = useMemo(() => buildLinearAppSetupUrl(siteUrl), [siteUrl]);
    const saveRouting = (
        changes: Partial<{
            applyToAllProjects: boolean;
            projectUuids: string[];
            enabled: boolean;
            linearTeamId: string | null;
            linearProjectId: string | null;
        }>,
    ) => {
        if (!routing) return;
        updateRouting({
            applyToAllProjects:
                changes.applyToAllProjects ?? routing.applyToAllProjects,
            projectUuids: changes.projectUuids ?? routing.projectUuids,
            enabled: changes.enabled ?? routing.enabled,
            linearTeamId:
                changes.linearTeamId === undefined
                    ? routing.linearTeamId
                    : changes.linearTeamId,
            linearProjectId:
                changes.linearProjectId === undefined
                    ? routing.linearProjectId
                    : changes.linearProjectId,
        });
    };

    const teamOptions = useMemo(
        () =>
            selectOptionsWithCurrent(
                (linearTeams ?? []).map((team) => ({
                    value: team.id,
                    label: `${team.name} (${team.key})`,
                })),
                routing?.linearTeamId ?? null,
            ),
        [linearTeams, routing?.linearTeamId],
    );
    const linearProjectOptions = useMemo(
        () =>
            selectOptionsWithCurrent(
                (linearProjects ?? []).map((project) => ({
                    value: project.id,
                    label: project.name,
                })),
                routing?.linearProjectId ?? null,
            ),
        [linearProjects, routing?.linearProjectId],
    );
    const canEnableExport =
        !!routing?.linearTeamId &&
        (routing.applyToAllProjects || routing.projectUuids.length > 0);

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
                        Existing open findings can be exported with the button
                        below. Each issue links back here, and the review
                        issue shows the Linear URL. This is a one-way export;
                        status changes are not synced back.
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
                (hasLinear &&
                    !requiresReconnect &&
                    routingQuery.isInitialLoading) ? (
                    <Loader size="sm" />
                ) : (
                    <Switch
                        size="md"
                        aria-label="Create Linear issues for AI review findings"
                        checked={
                            !!routing?.enabled &&
                            hasLinear &&
                            !requiresReconnect
                        }
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !hasLinear ||
                            requiresReconnect ||
                            !canEnableExport
                        }
                        onChange={(event) =>
                            saveRouting({
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
                        onClick={() => deleteLinear()}
                    >
                        Remove
                    </Button>
                </Group>
            )}

            {hasLinear && !requiresReconnect && routing && (
                <Stack gap="sm">
                    <Checkbox
                        label="All projects"
                        description="Findings from every project, including ones created later."
                        checked={routing.applyToAllProjects}
                        disabled={!canEdit || isUpdating || projectsLoading}
                        onChange={(event) => {
                            const applyToAllProjects =
                                event.currentTarget.checked;
                            saveRouting({
                                applyToAllProjects,
                                projectUuids: applyToAllProjects
                                    ? []
                                    : projects.map(
                                          (project) => project.projectUuid,
                                      ),
                                enabled:
                                    routing.enabled && !!routing.linearTeamId,
                            });
                        }}
                    />
                    {!routing.applyToAllProjects && (
                        <MultiSelect
                            label="Lightdash projects" // pragma: allowlist secret
                            placeholder={
                                projectsLoading
                                    ? 'Loading projects'
                                    : 'Select projects'
                            }
                            data={projects.map((project) => ({
                                value: project.projectUuid,
                                label: project.name,
                            }))}
                            value={routing.projectUuids}
                            searchable
                            disabled={!canEdit || isUpdating || projectsLoading}
                            onChange={(projectUuids) =>
                                saveRouting({
                                    applyToAllProjects: false,
                                    projectUuids,
                                    enabled:
                                        routing.enabled &&
                                        !!routing.linearTeamId &&
                                        projectUuids.length > 0,
                                })
                            }
                        />
                    )}
                    <Select
                        label="Linear team"
                        placeholder={
                            linearTeamsLoading
                                ? 'Loading teams'
                                : 'Select a team'
                        }
                        data={teamOptions}
                        value={routing.linearTeamId}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            routingQuery.isInitialLoading ||
                            linearTeamsLoading
                        }
                        onChange={(linearTeamId) => {
                            if (linearTeamsLoading) return;
                            saveRouting({
                                enabled:
                                    !!linearTeamId &&
                                    (routing.applyToAllProjects ||
                                        routing.projectUuids.length > 0),
                                linearTeamId,
                                linearProjectId: null,
                            });
                        }}
                    />
                    <Select
                        label="Linear project"
                        description="Optional. Issues without a project still go to the selected team."
                        placeholder={
                            linearProjectsLoading
                                ? 'Loading projects'
                                : 'Optional project'
                        }
                        data={linearProjectOptions}
                        value={routing.linearProjectId}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !routing.linearTeamId ||
                            linearProjectsLoading
                        }
                        clearable
                        onChange={(linearProjectId) => {
                            if (linearProjectsLoading) return;
                            saveRouting({ linearProjectId });
                        }}
                    />
                    {routing.enabled && (
                        <Button
                            size="xs"
                            variant="default"
                            disabled={!canEdit || isUpdating}
                            loading={linearBackfilling}
                            onClick={() => backfillLinear()}
                        >
                            Create issues for existing findings
                        </Button>
                    )}
                </Stack>
            )}
        </>
    );
};

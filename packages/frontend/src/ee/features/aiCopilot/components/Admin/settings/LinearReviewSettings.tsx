import {
    Badge,
    Box,
    Button,
    Checkbox,
    Divider,
    Group,
    Loader,
    MultiSelect,
    Paper,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconExternalLink, IconTrash } from '@tabler/icons-react';
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
import linearSvg from '../../../../../../svgs/linear.svg';
import {
    useBackfillReviewLinearIssues,
    useReviewLinearRouting,
    useUpdateReviewLinearRouting,
} from '../../../hooks/useReviewNotificationSettings';
import styles from './LinearReviewSettings.module.css';
import {
    isLinearSettingsPreviewEnabled,
    LINEAR_SETTINGS_PREVIEW,
    buildLinearAppSetupUrl,
} from './linearReviewSettingsUtils';

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

const LinearLogo = ({ compact = false }: { compact?: boolean }) => (
    <img
        src={linearSvg}
        alt="Linear"
        className={compact ? styles.logoSm : styles.logo}
    />
);

export const LinearReviewSettings = () => {
    const { health, user } = useApp();
    const [linearClientId, setLinearClientId] = useState('');
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const siteUrl = health.data?.siteUrl ?? window.location.origin;
    const isPreview = isLinearSettingsPreviewEnabled();

    const { data: projects = [], isInitialLoading: projectsLoading } =
        useProjects();
    const linearInstallationQuery = useLinearInstallation({
        enabled: !isPreview,
    });
    const installation = isPreview
        ? LINEAR_SETTINGS_PREVIEW.installation
        : linearInstallationQuery.data;
    const hasLinear = !!installation;
    const requiresReconnect = installation?.requiresReconnect === true;
    const canLoadLinear = hasLinear && !requiresReconnect && !isPreview;
    const { data: fetchedLinearTeams, isInitialLoading: linearTeamsLoading } =
        useLinearTeams({ enabled: canLoadLinear });
    const routingQuery = useReviewLinearRouting({
        enabled: canLoadLinear,
    });
    const routing = isPreview
        ? LINEAR_SETTINGS_PREVIEW.routing
        : routingQuery.data;
    const {
        data: fetchedLinearProjects,
        isInitialLoading: linearProjectsLoading,
    } = useLinearProjects({
        enabled: canLoadLinear,
        teamId: routing?.linearTeamId ?? null,
    });
    const linearTeams = isPreview
        ? LINEAR_SETTINGS_PREVIEW.teams
        : fetchedLinearTeams;
    const linearProjects = isPreview
        ? LINEAR_SETTINGS_PREVIEW.projects
        : fetchedLinearProjects;
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
        if (!routing || isPreview) return;
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

    const connectForm = (
        <form onSubmit={submitLinearOAuth}>
            <Group gap="xs" wrap="nowrap" align="flex-end">
                <TextInput
                    className={styles.clientIdInput}
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
                    {requiresReconnect ? 'Reconnect Linear' : 'Connect Linear'}
                </Button>
            </Group>
        </form>
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
                        <LinearLogo compact={hasLinear && !requiresReconnect} />
                        <Title order={6}>Linear issues</Title>
                        {hasLinear && (
                            <Badge
                                size="sm"
                                variant="light"
                                color={requiresReconnect ? 'yellow' : 'green'}
                            >
                                {requiresReconnect
                                    ? 'Reconnect required'
                                    : 'Connected'}
                            </Badge>
                        )}
                    </Group>
                    <Text c="ldGray.6" fz="xs">
                        {hasLinear && !requiresReconnect
                            ? 'New findings create a Linear issue automatically. Existing open findings can be exported below. Each issue links both ways; status is not synced.'
                            : 'Send review findings to Linear as issues. Each issue links both ways. Status is not synced.'}
                    </Text>
                    {hasLinear && !requiresReconnect && (
                        <Text c="ldGray.6" fz="xs" mt={4}>
                            Connected to {installation.organizationName} (
                            {installation.organizationUrlKey}).
                        </Text>
                    )}
                </Box>
                {hasLinear &&
                    !requiresReconnect &&
                    (!isPreview &&
                    (linearInstallationQuery.isInitialLoading ||
                        routingQuery.isInitialLoading) ? (
                        <Loader size="sm" />
                    ) : (
                        <Switch
                            size="md"
                            aria-label="Create Linear issues for AI review findings"
                            checked={!!routing?.enabled}
                            disabled={
                                !canEdit ||
                                isUpdating ||
                                isPreview ||
                                !canEnableExport
                            }
                            onChange={(event) =>
                                saveRouting({
                                    enabled: event.currentTarget.checked,
                                })
                            }
                        />
                    ))}
            </Group>

            {!hasLinear && (
                <Paper variant="dotted" p="md" radius="md">
                    <Stack gap="md">
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                            <Text className={styles.stepIndex}>1</Text>
                            <Stack gap={6} flex={1}>
                                <Text fw={600} fz="sm">
                                    Create a Linear app
                                </Text>
                                <Text c="ldGray.6" fz="xs">
                                    Opens Linear with the callback already
                                    filled in. Private app, no client secret.
                                </Text>
                                <Button
                                    size="xs"
                                    variant="default"
                                    component="a"
                                    href={setupUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    w="fit-content"
                                    rightSection={
                                        <MantineIcon
                                            icon={IconExternalLink}
                                            size={14}
                                        />
                                    }
                                >
                                    Create Linear app
                                </Button>
                            </Stack>
                        </Group>
                        <Divider />
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                            <Text className={styles.stepIndex}>2</Text>
                            <Stack gap={6} flex={1}>
                                <Text fw={600} fz="sm">
                                    Paste the client ID and connect
                                </Text>
                                <Text c="ldGray.6" fz="xs">
                                    Use the public client ID from the app you
                                    just created.
                                </Text>
                                {connectForm}
                            </Stack>
                        </Group>
                    </Stack>
                </Paper>
            )}

            {requiresReconnect && (
                <Paper variant="dotted" p="md" radius="md">
                    <Stack gap="xs">
                        <Text fw={600} fz="sm">
                            Reconnect Linear to keep exporting issues
                        </Text>
                        <Text c="ldGray.6" fz="xs">
                            The saved app can no longer create issues. Create a
                            new private app or reconnect with the same client
                            ID.
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            component="a"
                            href={setupUrl}
                            target="_blank"
                            rel="noreferrer"
                            w="fit-content"
                            rightSection={
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size={14}
                                />
                            }
                        >
                            Create Linear app
                        </Button>
                        {connectForm}
                    </Stack>
                </Paper>
            )}

            {hasLinear && !requiresReconnect && routing && (
                <Stack gap="sm">
                    <Checkbox
                        label="All projects"
                        description="Findings from every project, including ones created later."
                        checked={routing.applyToAllProjects}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            isPreview ||
                            projectsLoading
                        }
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
                            label="Projects"
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
                            disabled={
                                !canEdit ||
                                isUpdating ||
                                isPreview ||
                                projectsLoading
                            }
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
                            isPreview ||
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
                            isPreview ||
                            !routing.linearTeamId ||
                            linearProjectsLoading
                        }
                        clearable
                        onChange={(linearProjectId) => {
                            if (linearProjectsLoading) return;
                            saveRouting({ linearProjectId });
                        }}
                    />
                    <Group gap="xs">
                        {routing.enabled && (
                            <Button
                                size="xs"
                                variant="default"
                                disabled={!canEdit || isUpdating || isPreview}
                                loading={linearBackfilling}
                                onClick={() => backfillLinear()}
                            >
                                Create issues for existing findings
                            </Button>
                        )}
                        <Button
                            size="xs"
                            variant="default"
                            component="a"
                            href="/api/v1/linear/install"
                            disabled={!canEdit || isUpdating || isPreview}
                        >
                            Reconnect
                        </Button>
                        <Button
                            type="button"
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={!canEdit || isUpdating || isPreview}
                            leftSection={
                                <MantineIcon icon={IconTrash} size={14} />
                            }
                            onClick={() => deleteLinear()}
                        >
                            Remove
                        </Button>
                    </Group>
                </Stack>
            )}
        </>
    );
};

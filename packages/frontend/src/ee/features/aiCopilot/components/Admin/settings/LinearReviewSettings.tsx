import {
    isLinearConnectError,
    LINEAR_CONNECT_ERROR_PARAM,
    LinearConnectError,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Checkbox,
    Divider,
    Group,
    Loader,
    MultiSelect,
    Paper,
    PasswordInput,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core';
import { IconExternalLink, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import Callout from '../../../../../../components/common/Callout';
import {
    useDeleteLinearInstallationMutation,
    useInstallLinear,
    useLinearInstallation,
    useLinearProjects,
    useLinearTeams,
} from '../../../../../../components/common/LinearIntegration/hooks/useLinearIntegration';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { SettingRow } from '../../../../../../components/common/Settings/SettingLayout';
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
    buildLinearAppSetupUrl,
    getLinearConnectErrorMessage,
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

// Matches MAX_CREDENTIAL_LENGTH in LinearAppService
const MAX_CREDENTIAL_LENGTH = 255;

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
    const [linearClientSecret, setLinearClientSecret] = useState('');
    const installLinear = useInstallLinear();
    const [searchParams, setSearchParams] = useSearchParams();
    const connectErrorParam = searchParams.get(LINEAR_CONNECT_ERROR_PARAM);
    const connectError = isLinearConnectError(connectErrorParam)
        ? connectErrorParam
        : null;
    const [isEditingCredentials, setIsEditingCredentials] = useState(
        connectError === LinearConnectError.INVALID_CLIENT,
    );
    const dismissConnectError = () => {
        setSearchParams(
            (params) => {
                params.delete(LINEAR_CONNECT_ERROR_PARAM);
                return params;
            },
            { replace: true },
        );
    };
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const siteUrl = health.data?.siteUrl ?? window.location.origin;

    const { data: projects = [], isInitialLoading: projectsLoading } =
        useProjects();
    const linearInstallationQuery = useLinearInstallation();
    const installation = linearInstallationQuery.data;
    const installationLoading = linearInstallationQuery.isInitialLoading;
    const hasLinear = !!installation;
    const requiresReconnect = installation?.requiresReconnect === true;
    const requiresClientSecret = installation?.requiresClientSecret === true;
    const canLoadLinear = hasLinear && !requiresReconnect;
    const { data: linearTeams, isInitialLoading: linearTeamsLoading } =
        useLinearTeams({ enabled: canLoadLinear });
    const routingQuery = useReviewLinearRouting({
        enabled: canLoadLinear,
    });
    const routing = routingQuery.data;
    const { data: linearProjects, isInitialLoading: linearProjectsLoading } =
        useLinearProjects({
            enabled: canLoadLinear,
            teamId: routing?.linearTeamId ?? null,
        });
    const { mutate: updateRouting, isLoading: routingUpdating } =
        useUpdateReviewLinearRouting();
    const { mutate: backfillLinear, isLoading: linearBackfilling } =
        useBackfillReviewLinearIssues();
    const { mutate: deleteLinear, isLoading: linearDeleting } =
        useDeleteLinearInstallationMutation();
    const isUpdating = routingUpdating || linearDeleting || linearBackfilling;

    const canConnect =
        linearClientId.trim().length > 0 &&
        linearClientSecret.trim().length > 0;
    const submitLinearOAuth = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canConnect) return;
        installLinear.mutate({
            clientId: linearClientId.trim(),
            clientSecret: linearClientSecret.trim(),
        });
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

    const connectForm = (
        <form onSubmit={submitLinearOAuth}>
            <Group gap="xs" wrap="nowrap" align="flex-end">
                <TextInput
                    className={styles.clientIdInput}
                    size="xs"
                    label="Client ID"
                    value={linearClientId}
                    maxLength={MAX_CREDENTIAL_LENGTH}
                    disabled={!canEdit || isUpdating}
                    onChange={(event) =>
                        setLinearClientId(event.currentTarget.value)
                    }
                />
                <PasswordInput
                    className={styles.clientIdInput}
                    size="xs"
                    label="Client secret"
                    value={linearClientSecret}
                    maxLength={MAX_CREDENTIAL_LENGTH}
                    disabled={!canEdit || isUpdating}
                    onChange={(event) =>
                        setLinearClientSecret(event.currentTarget.value)
                    }
                />
                <Button
                    type="submit"
                    size="xs"
                    disabled={!canEdit || isUpdating || !canConnect}
                    loading={installLinear.isLoading}
                >
                    {hasLinear ? 'Reconnect Linear' : 'Connect Linear'}
                </Button>
            </Group>
        </form>
    );

    return (
        <>
            <Divider />
            <SettingRow
                title="Linear issues"
                titlePrefix={
                    <LinearLogo compact={hasLinear && !requiresReconnect} />
                }
                titleAddon={
                    hasLinear && (
                        <Badge
                            size="sm"
                            color={requiresReconnect ? 'yellow' : 'green'}
                        >
                            {requiresReconnect
                                ? 'Reconnect required'
                                : 'Connected'}
                        </Badge>
                    )
                }
                description={
                    hasLinear && !requiresReconnect
                        ? 'New findings create a Linear issue automatically. Existing open findings can be exported below. Each issue links both ways; status is not synced.'
                        : 'Send review findings to Linear as issues. Each issue links both ways. Status is not synced.'
                }
                control={
                    <>
                        {installationLoading && <Loader size="sm" />}
                        {canLoadLinear &&
                            (routingQuery.isInitialLoading ? (
                                <Loader size="sm" />
                            ) : (
                                <Switch
                                    size="md"
                                    aria-label="Create Linear issues for AI review findings"
                                    checked={!!routing?.enabled}
                                    disabled={
                                        !canEdit ||
                                        isUpdating ||
                                        !canEnableExport
                                    }
                                    onChange={(event) =>
                                        saveRouting({
                                            enabled:
                                                event.currentTarget.checked,
                                        })
                                    }
                                />
                            ))}
                    </>
                }
            >
                {hasLinear && !requiresReconnect && (
                    <Text c="dimmed" fz="xs" mt="xxs">
                        Connected to {installation.organizationName} (
                        {installation.organizationUrlKey}).
                    </Text>
                )}
            </SettingRow>

            {connectError && (
                <Callout
                    variant="danger"
                    title="Couldn't connect Linear"
                    withCloseButton
                    closeButtonLabel="Dismiss"
                    onClose={dismissConnectError}
                >
                    <Text size="xs">
                        {getLinearConnectErrorMessage(connectError)}
                    </Text>
                </Callout>
            )}

            {!hasLinear && !installationLoading && (
                <Paper variant="dotted" p="md" radius="md">
                    <Stack gap="md">
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                            <Text className={styles.stepIndex}>1</Text>
                            <Stack gap={6} flex={1}>
                                <Text fw={600} fz="sm">
                                    Create a Linear app
                                </Text>
                                <Text c="dimmed" fz="xs">
                                    Opens Linear with the callback already
                                    filled in. Keep the app private.
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
                                    Paste the client credentials and connect
                                </Text>
                                <Text c="dimmed" fz="xs">
                                    Copy the client ID and client secret from
                                    the app you just created.
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
                        <Text c="dimmed" fz="xs">
                            The saved app can no longer create issues. Create a
                            new private app or reconnect with the client ID and
                            client secret of the existing one.
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

            {hasLinear && !requiresReconnect && requiresClientSecret && (
                <Paper variant="dotted" p="md" radius="md">
                    <Stack gap="xs">
                        <Text fw={600} fz="sm">
                            Add the client secret to keep exporting issues
                        </Text>
                        <Text c="dimmed" fz="xs">
                            Linear now requires the app's client secret. The
                            connection still works, but it can stop when Linear
                            renews its token. Paste the client ID and client
                            secret of your Linear app and reconnect.
                        </Text>
                        {connectForm}
                    </Stack>
                </Paper>
            )}

            {hasLinear &&
                !requiresReconnect &&
                !requiresClientSecret &&
                isEditingCredentials && (
                    <Paper variant="dotted" p="md" radius="md">
                        <Stack gap="xs">
                            <Text fw={600} fz="sm">
                                Update the client credentials
                            </Text>
                            <Text c="dimmed" fz="xs">
                                Paste the client ID and client secret of your
                                Linear app. Team and project settings are kept
                                when you reconnect to the same Linear workspace.
                            </Text>
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
                    <Group gap="xs">
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
                        {!requiresClientSecret && (
                            <>
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
                                    variant="default"
                                    disabled={!canEdit || isUpdating}
                                    onClick={() =>
                                        setIsEditingCredentials(
                                            (editing) => !editing,
                                        )
                                    }
                                >
                                    {isEditingCredentials
                                        ? 'Hide credentials'
                                        : 'Update credentials'}
                                </Button>
                            </>
                        )}
                        <Button
                            type="button"
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={!canEdit || isUpdating}
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

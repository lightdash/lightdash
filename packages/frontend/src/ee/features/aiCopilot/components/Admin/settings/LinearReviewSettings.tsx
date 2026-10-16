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
import { useTranslation } from 'react-i18next';
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

const LinearLogo = ({ compact = false }: { compact?: boolean }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <img
            src={linearSvg}
            alt={t('settings.linear.logoAlt')}
            className={compact ? styles.logoSm : styles.logo}
        />
    );
};

export const LinearReviewSettings = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { health, user } = useApp();
    const [linearClientId, setLinearClientId] = useState('');
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const siteUrl = health.data?.siteUrl ?? window.location.origin;

    const { data: projects = [], isInitialLoading: projectsLoading } =
        useProjects();
    const linearInstallationQuery = useLinearInstallation();
    const installation = linearInstallationQuery.data;
    const installationLoading = linearInstallationQuery.isInitialLoading;
    const hasLinear = !!installation;
    const requiresReconnect = installation?.requiresReconnect === true;
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

    const connectForm = (
        <form onSubmit={submitLinearOAuth}>
            <Group gap="xs" wrap="nowrap" align="flex-end">
                <TextInput
                    className={styles.clientIdInput}
                    size="xs"
                    label={t('settings.linear.clientIdLabel')}
                    value={linearClientId}
                    placeholder={t('settings.linear.clientIdPlaceholder')}
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
                        ? t('settings.linear.reconnectLinear')
                        : t('settings.linear.connectLinear')}
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
                        <Title order={6}>{t('settings.linear.title')}</Title>
                        {hasLinear && (
                            <Badge
                                size="sm"
                                color={requiresReconnect ? 'yellow' : 'green'}
                            >
                                {requiresReconnect
                                    ? t('settings.linear.reconnectRequired')
                                    : t('settings.linear.connected')}
                            </Badge>
                        )}
                    </Group>
                    <Text c="dimmed" fz="xs">
                        {hasLinear && !requiresReconnect
                            ? t('settings.linear.connectedDescription')
                            : t('settings.linear.disconnectedDescription')}
                    </Text>
                    {hasLinear && !requiresReconnect && (
                        <Text c="dimmed" fz="xs" mt={4}>
                            {t('settings.linear.connectedTo', {
                                name: installation.organizationName,
                                key: installation.organizationUrlKey,
                            })}
                        </Text>
                    )}
                </Box>
                {installationLoading && <Loader size="sm" />}
                {canLoadLinear &&
                    (routingQuery.isInitialLoading ? (
                        <Loader size="sm" />
                    ) : (
                        <Switch
                            size="md"
                            aria-label={t('settings.linear.toggleAria')}
                            checked={!!routing?.enabled}
                            disabled={
                                !canEdit || isUpdating || !canEnableExport
                            }
                            onChange={(event) =>
                                saveRouting({
                                    enabled: event.currentTarget.checked,
                                })
                            }
                        />
                    ))}
            </Group>

            {!hasLinear && !installationLoading && (
                <Paper variant="dotted" p="md" radius="md">
                    <Stack gap="md">
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                            <Text className={styles.stepIndex}>1</Text>
                            <Stack gap={6} flex={1}>
                                <Text fw={600} fz="sm">
                                    {t('settings.linear.step1Title')}
                                </Text>
                                <Text c="dimmed" fz="xs">
                                    {t('settings.linear.step1Description')}
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
                                    {t('settings.linear.createApp')}
                                </Button>
                            </Stack>
                        </Group>
                        <Divider />
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                            <Text className={styles.stepIndex}>2</Text>
                            <Stack gap={6} flex={1}>
                                <Text fw={600} fz="sm">
                                    {t('settings.linear.step2Title')}
                                </Text>
                                <Text c="dimmed" fz="xs">
                                    {t('settings.linear.step2Description')}
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
                            {t('settings.linear.reconnectTitle')}
                        </Text>
                        <Text c="dimmed" fz="xs">
                            {t('settings.linear.reconnectDescription')}
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
                            {t('settings.linear.createApp')}
                        </Button>
                        {connectForm}
                    </Stack>
                </Paper>
            )}

            {hasLinear && !requiresReconnect && routing && (
                <Stack gap="sm">
                    <Checkbox
                        label={t('settings.linear.allProjects')}
                        description={t(
                            'settings.linear.allProjectsDescription',
                        )}
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
                            label={t('settings.linear.projects')}
                            placeholder={
                                projectsLoading
                                    ? t('settings.linear.loadingProjects')
                                    : t('settings.linear.selectProjects')
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
                        label={t('settings.linear.team')}
                        placeholder={
                            linearTeamsLoading
                                ? t('settings.linear.loadingTeams')
                                : t('settings.linear.selectTeam')
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
                        label={t('settings.linear.project')}
                        description={t('settings.linear.projectDescription')}
                        placeholder={
                            linearProjectsLoading
                                ? t('settings.linear.loadingProjects')
                                : t('settings.linear.optionalProject')
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
                                {t('settings.linear.backfill')}
                            </Button>
                        )}
                        <Button
                            size="xs"
                            variant="default"
                            component="a"
                            href="/api/v1/linear/install"
                            disabled={!canEdit || isUpdating}
                        >
                            {t('settings.linear.reconnect')}
                        </Button>
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
                            {t('actions.remove', { ns: 'common' })}
                        </Button>
                    </Group>
                </Stack>
            )}
        </>
    );
};

import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Checkbox,
    Code,
    CopyButton,
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
    Title,
} from '@mantine/core';
import {
    IconCheck,
    IconCopy,
    IconExternalLink,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
    useDeleteJiraInstallation,
    useInstallJira,
    useJiraInstallation,
    useJiraIssueTypes,
    useJiraProjects,
    useJiraSites,
    useSelectJiraSite,
} from '../../../../../../components/common/JiraIntegration/hooks/useJiraIntegration';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useProjects } from '../../../../../../hooks/useProjects';
import useApp from '../../../../../../providers/App/useApp';
import jiraSvg from '../../../../../../svgs/jira.svg';
import {
    useBackfillReviewJiraIssues,
    useReviewJiraRouting,
    useUpdateReviewJiraRouting,
} from '../../../hooks/useReviewNotificationSettings';
import styles from './JiraReviewSettings.module.css';

const ATLASSIAN_DEVELOPER_CONSOLE_URL =
    'https://developer.atlassian.com/console/myapps/';

const withCurrent = (
    options: Array<{ value: string; label: string }>,
    current: string | null,
) =>
    !current || options.some(({ value }) => value === current)
        ? options
        : [...options, { value: current, label: current }];

// Matches MAX_CREDENTIAL_LENGTH in JiraAppService
const MAX_CREDENTIAL_LENGTH = 255;

const JiraLogo = ({ compact = false }: { compact?: boolean }) => (
    <img
        src={jiraSvg}
        alt="Jira"
        className={compact ? styles.logoSm : styles.logo}
    />
);

export const JiraReviewSettings = () => {
    const { health, user } = useApp();
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const siteUrl = health.data?.siteUrl ?? window.location.origin;
    const callbackUrl = `${siteUrl}/api/v1/jira/oauth/callback`;
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const { data: projects = [], isInitialLoading: projectsLoading } =
        useProjects();
    const installationQuery = useJiraInstallation();
    const installation = installationQuery.data;
    const hasJira = !!installation;
    const needsSite = installation?.requiresSiteSelection === true;
    const connected = hasJira && !needsSite;
    const sitesQuery = useJiraSites({ enabled: hasJira });
    const routingQuery = useReviewJiraRouting({ enabled: connected });
    const routing = routingQuery.data;
    const jiraProjectsQuery = useJiraProjects({ enabled: connected });
    const issueTypesQuery = useJiraIssueTypes({
        enabled: connected,
        projectId: routing?.jiraProjectId ?? null,
    });
    const updateRouting = useUpdateReviewJiraRouting();
    const installJira = useInstallJira();
    const selectSite = useSelectJiraSite();
    const deleteJira = useDeleteJiraInstallation();
    const backfill = useBackfillReviewJiraIssues();
    const isUpdating =
        updateRouting.isLoading ||
        installJira.isLoading ||
        selectSite.isLoading ||
        deleteJira.isLoading ||
        backfill.isLoading;

    const saveRouting = (
        changes: Partial<{
            applyToAllProjects: boolean;
            projectUuids: string[];
            enabled: boolean;
            jiraProjectId: string | null;
            jiraIssueTypeId: string | null;
        }>,
    ) => {
        if (!routing) return;
        updateRouting.mutate({
            applyToAllProjects:
                changes.applyToAllProjects ?? routing.applyToAllProjects,
            projectUuids: changes.projectUuids ?? routing.projectUuids,
            enabled: changes.enabled ?? routing.enabled,
            jiraProjectId:
                changes.jiraProjectId === undefined
                    ? routing.jiraProjectId
                    : changes.jiraProjectId,
            jiraIssueTypeId:
                changes.jiraIssueTypeId === undefined
                    ? routing.jiraIssueTypeId
                    : changes.jiraIssueTypeId,
        });
    };

    const jiraProjectOptions = useMemo(
        () =>
            withCurrent(
                (jiraProjectsQuery.data ?? []).map((project) => ({
                    value: project.id,
                    label: `${project.name} (${project.key})`,
                })),
                routing?.jiraProjectId ?? null,
            ),
        [jiraProjectsQuery.data, routing?.jiraProjectId],
    );
    const issueTypeOptions = useMemo(
        () =>
            withCurrent(
                (issueTypesQuery.data ?? []).map((issueType) => ({
                    value: issueType.id,
                    label: issueType.name,
                })),
                routing?.jiraIssueTypeId ?? null,
            ),
        [issueTypesQuery.data, routing?.jiraIssueTypeId],
    );
    const canEnable =
        !!routing?.jiraProjectId &&
        !!routing.jiraIssueTypeId &&
        (routing.applyToAllProjects || routing.projectUuids.length > 0);
    const canConnect =
        clientId.trim().length > 0 && clientSecret.trim().length > 0;

    const submitCredentials = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canConnect) return;
        installJira.mutate({
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim(),
        });
    };

    return (
        <>
            <Divider mx="calc(var(--mantine-spacing-md) * -1)" />
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Box maw={620}>
                    <Group gap="xs" mb={4}>
                        <JiraLogo compact={hasJira} />
                        <Title order={6}>Jira issues</Title>
                        {hasJira && (
                            <Badge
                                size="sm"
                                color={needsSite ? 'yellow' : 'green'}
                            >
                                {needsSite ? 'Select site' : 'Connected'}
                            </Badge>
                        )}
                    </Group>
                    <Text c="dimmed" fz="xs">
                        Send review findings to Jira automatically. Existing
                        open findings can be exported below; status is not
                        synced.
                    </Text>
                    {connected && (
                        <Text c="dimmed" fz="xs" mt={4}>
                            Connected to {installation.siteName} (
                            {installation.siteUrl}).
                        </Text>
                    )}
                </Box>
                {installationQuery.isInitialLoading && <Loader size="sm" />}
                {connected && routing && (
                    <Switch
                        size="md"
                        aria-label="Create Jira issues for AI review findings"
                        checked={routing.enabled}
                        disabled={!canEdit || isUpdating || !canEnable}
                        onChange={(event) =>
                            saveRouting({
                                enabled: event.currentTarget.checked,
                            })
                        }
                    />
                )}
            </Group>

            {!hasJira && !installationQuery.isInitialLoading && (
                <Paper variant="dotted" p="md" radius="md">
                    <Stack gap="md">
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                            <Text className={styles.stepIndex}>1</Text>
                            <Stack gap={6} flex={1}>
                                <Text fw={600} fz="sm">
                                    Create an Atlassian OAuth 2.0 app
                                </Text>
                                <Text c="dimmed" fz="xs">
                                    In the developer console create an OAuth 2.0
                                    integration. Under Permissions add the Jira
                                    API and tick the classic scopes
                                    read:jira-work and write:jira-work. Under
                                    Authorization set this callback URL.
                                </Text>
                                <Group gap="xs" wrap="nowrap">
                                    <Code>{callbackUrl}</Code>
                                    <CopyButton value={callbackUrl}>
                                        {({ copied, copy }) => (
                                            <ActionIcon
                                                variant="subtle"
                                                size="sm"
                                                aria-label="Copy callback URL"
                                                onClick={copy}
                                            >
                                                <MantineIcon
                                                    icon={
                                                        copied
                                                            ? IconCheck
                                                            : IconCopy
                                                    }
                                                    size={14}
                                                />
                                            </ActionIcon>
                                        )}
                                    </CopyButton>
                                </Group>
                                <Button
                                    size="xs"
                                    variant="default"
                                    component="a"
                                    href={ATLASSIAN_DEVELOPER_CONSOLE_URL}
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
                                    Open Atlassian developer console
                                </Button>
                            </Stack>
                        </Group>
                        <Divider />
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                            <Text className={styles.stepIndex}>2</Text>
                            <Stack gap={6} flex={1}>
                                <Text fw={600} fz="sm">
                                    Paste the client ID and secret
                                </Text>
                                <Text c="dimmed" fz="xs">
                                    Both are on the app's Settings page. The
                                    secret is stored encrypted and only used for
                                    this organization. Connecting opens
                                    Atlassian: sign in there with an account
                                    that has Jira on the site you want to use,
                                    or Atlassian shows Access denied.
                                </Text>
                                <form onSubmit={submitCredentials}>
                                    <Group
                                        gap="xs"
                                        wrap="nowrap"
                                        align="flex-end"
                                    >
                                        <TextInput
                                            className={styles.credentialInput}
                                            size="xs"
                                            label="Client ID"
                                            value={clientId}
                                            maxLength={MAX_CREDENTIAL_LENGTH}
                                            disabled={!canEdit || isUpdating}
                                            onChange={(event) =>
                                                setClientId(
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                        <PasswordInput
                                            className={styles.credentialInput}
                                            size="xs"
                                            label="Client secret"
                                            value={clientSecret}
                                            maxLength={MAX_CREDENTIAL_LENGTH}
                                            disabled={!canEdit || isUpdating}
                                            onChange={(event) =>
                                                setClientSecret(
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                        <Button
                                            type="submit"
                                            size="xs"
                                            disabled={
                                                !canEdit ||
                                                isUpdating ||
                                                !canConnect
                                            }
                                            loading={installJira.isLoading}
                                        >
                                            Connect Jira
                                        </Button>
                                    </Group>
                                </form>
                            </Stack>
                        </Group>
                    </Stack>
                </Paper>
            )}

            {needsSite && (
                <Select
                    label="Jira site"
                    description="Choose the site that will receive review issues."
                    placeholder={
                        sitesQuery.isInitialLoading
                            ? 'Loading sites'
                            : 'Select site'
                    }
                    data={(sitesQuery.data ?? []).map((site) => ({
                        value: site.id,
                        label: `${site.name} (${site.url})`,
                    }))}
                    disabled={
                        !canEdit || isUpdating || sitesQuery.isInitialLoading
                    }
                    onChange={(siteId) => siteId && selectSite.mutate(siteId)}
                />
            )}

            {connected && routing && (
                <Stack gap="sm">
                    <Checkbox
                        label="All projects"
                        description="Findings from every Lightdash project, including ones created later."
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
                                enabled: routing.enabled && canEnable,
                            });
                        }}
                    />
                    {!routing.applyToAllProjects && (
                        <MultiSelect
                            label="Lightdash projects"
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
                                    projectUuids,
                                    enabled:
                                        routing.enabled &&
                                        projectUuids.length > 0,
                                })
                            }
                        />
                    )}
                    <Select
                        label="Jira project"
                        placeholder={
                            jiraProjectsQuery.isInitialLoading
                                ? 'Loading projects'
                                : 'Select a project'
                        }
                        data={jiraProjectOptions}
                        value={routing.jiraProjectId}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            jiraProjectsQuery.isInitialLoading
                        }
                        searchable
                        onChange={(jiraProjectId) =>
                            saveRouting({
                                jiraProjectId,
                                jiraIssueTypeId: null,
                                enabled: false,
                            })
                        }
                    />
                    <Select
                        label="Jira issue type"
                        placeholder={
                            issueTypesQuery.isInitialLoading
                                ? 'Loading issue types'
                                : 'Select an issue type'
                        }
                        data={issueTypeOptions}
                        value={routing.jiraIssueTypeId}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !routing.jiraProjectId ||
                            issueTypesQuery.isInitialLoading
                        }
                        onChange={(jiraIssueTypeId) =>
                            saveRouting({
                                jiraIssueTypeId,
                                enabled:
                                    !!jiraIssueTypeId &&
                                    (routing.applyToAllProjects ||
                                        routing.projectUuids.length > 0),
                            })
                        }
                    />
                    <Group gap="xs">
                        {routing.enabled && (
                            <Button
                                size="xs"
                                variant="default"
                                disabled={!canEdit || isUpdating}
                                loading={backfill.isLoading}
                                onClick={() => backfill.mutate()}
                            >
                                Create issues for existing findings
                            </Button>
                        )}
                        <Button
                            size="xs"
                            variant="default"
                            component="a"
                            href="/api/v1/jira/install"
                            disabled={!canEdit || isUpdating}
                        >
                            Reconnect
                        </Button>
                        <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={!canEdit || isUpdating}
                            leftSection={
                                <MantineIcon icon={IconTrash} size={14} />
                            }
                            onClick={() => deleteJira.mutate()}
                        >
                            Remove
                        </Button>
                    </Group>
                </Stack>
            )}
        </>
    );
};

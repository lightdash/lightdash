import {
    AGENT_ACCESS_PREVIEW_ACTIONS,
    getAgentCapabilityName,
    type AgentAccessPreviewActionId,
    type AgentCapabilitySourceAssignment,
    type AgentPermissionCheck,
    type AgentPermissionCheckStatus,
    type AgentPermissionExplanation,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconAlertTriangle,
    IconCheck,
    IconMinus,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { useProjects } from '../../hooks/useProjects';
import classes from './AgentAccessPreview.module.css';
import { useExplainAgentAccess } from './api';

const statusPresentation = {
    allowed: { label: 'Allowed', color: 'green', icon: IconCheck },
    refused: { label: 'Refused', color: 'red', icon: IconX },
    setup_needed: {
        label: 'Setup needed',
        color: 'yellow',
        icon: IconAlertTriangle,
    },
    not_checked: { label: 'Not checked', color: 'ldGray', icon: IconMinus },
};
const StatusBadge = ({
    status,
    legacy = false,
}: {
    status: AgentPermissionCheckStatus;
    legacy?: boolean;
}) => {
    const presentation = statusPresentation[status];
    return (
        <Badge
            color={presentation.color}
            leftSection={<MantineIcon icon={presentation.icon} size="xs" />}
        >
            {legacy ? 'Limits off' : presentation.label}
        </Badge>
    );
};
const groups: { label: string; kinds: AgentPermissionCheck['kind'][] }[] = [
    { label: 'Person', kinds: ['person_permission'] },
    {
        label: 'Agent access',
        kinds: [
            'agent_admission',
            'project_scope',
            'capability',
            'content_writes',
            'agent_enabled',
            'human_only',
            'operation_mapping',
        ],
    },
    { label: 'Warehouse', kinds: ['warehouse_confirmation'] },
    { label: 'Not checked', kinds: ['connection_grant'] },
];
const checkLinkLabel = (kind: AgentPermissionCheck['kind']) => {
    switch (kind) {
        case 'person_permission':
            return 'Project access';
        case 'content_writes':
        case 'agent_enabled':
            return 'MCP settings';
        case 'warehouse_confirmation':
            return 'Confirm in Identity';
        default:
            return 'Change';
    }
};
const isVisibleCheck = (row: AgentPermissionCheck) =>
    row.status === 'refused' ||
    row.status === 'setup_needed' ||
    row.message !== 'Not needed for this action.';
const checkTitle = (row: AgentPermissionCheck, person: string) => {
    if (row.kind === 'person_permission') return `${person}'s permissions`;
    if (row.kind === 'capability' && row.capability)
        return getAgentCapabilityName(row.capability);
    return row.label;
};
const resultSummary = (
    result: AgentPermissionExplanation,
    person: string,
    project: string,
    action: (typeof AGENT_ACCESS_PREVIEW_ACTIONS)[number],
) => {
    if (result.mode === 'legacy')
        return "Limits are off. Agents follow each person's permissions.";
    if (result.result === 'allowed') return 'Allowed by checked permissions.';
    if (result.result === 'not_checked')
        return 'Some permissions could not be checked.';
    const actionPhrase =
        action.group === 'capability'
            ? `use ${action.label}`
            : action.label.charAt(0).toLowerCase() + action.label.slice(1);
    const suffix = result.result === 'setup_needed' ? ' yet' : '';
    return `An agent cannot ${actionPhrase} for ${person} in ${project}${suffix}.`;
};
const systemRoleLabels: Record<
    Extract<
        AgentCapabilitySourceAssignment['role'],
        { kind: 'system' }
    >['role'],
    string
> = {
    viewer: 'Viewer',
    interactive_viewer: 'Interactive viewer',
    editor: 'Editor',
    developer: 'Developer',
    admin: 'Admin',
    member: 'Member',
};
const assignmentLabels: Record<
    AgentCapabilitySourceAssignment['assignment'],
    string
> = {
    organization: 'organization role',
    project_user: 'project role',
    project_group: 'project group',
    extra_organization: 'additional organization role',
};
const grantingSourceLabel = ({
    role,
    assignment,
}: AgentCapabilitySourceAssignment): string => {
    const name =
        role.kind === 'system'
            ? systemRoleLabels[role.role]
            : (role.name ?? 'a custom role');
    const kind = role.kind === 'custom' ? 'custom role, ' : '';
    return `Granted by ${name} (${kind}${assignmentLabels[assignment]})`;
};
const grantingSourceKey = (source: AgentCapabilitySourceAssignment): string =>
    JSON.stringify([
        source.role.kind,
        source.role.kind === 'system' ? source.role.role : source.role.roleUuid,
        source.assignment,
        source.projectUuid,
        source.groupUuid,
    ]);

const CheckRow = ({
    row,
    person,
}: {
    row: AgentPermissionCheck;
    person: string;
}) => (
    <Group align="flex-start" className={classes.checkRow}>
        <StatusBadge status={row.status} />
        <Stack gap={0}>
            <Text size="sm" fw={500}>
                {checkTitle(row, person)}
            </Text>
            <Text size="sm" c="dimmed">
                {row.message}
            </Text>
            {row.kind === 'capability' &&
                row.status === 'allowed' &&
                row.sourceAssignments.map((source) => (
                    <Text key={grantingSourceKey(source)} size="sm" c="dimmed">
                        {grantingSourceLabel(source)}
                    </Text>
                ))}
        </Stack>
        {row.settingsUrl && (
            <Anchor component={Link} to={row.settingsUrl} size="sm">
                {checkLinkLabel(row.kind)}
            </Anchor>
        )}
    </Group>
);
const PreviewResult = ({
    result,
    person,
    project,
    action,
}: {
    result: AgentPermissionExplanation;
    person: string;
    project: string;
    action: (typeof AGENT_ACCESS_PREVIEW_ACTIONS)[number];
}) => {
    const legacy = result.mode === 'legacy';
    const personReason = result.checks.find(
        (row) => row.kind === 'person_permission' && row.status === 'refused',
    );
    const reason = result.mainReason?.message ?? personReason?.message;
    const status = legacy ? 'not_checked' : result.result;
    return (
        <Stack gap="lg" role="region" aria-label="Agent access result">
            <Paper
                p="md"
                aria-live="polite"
                className={classes.summary}
                data-status={status}
            >
                <Group align="flex-start" wrap="nowrap">
                    <StatusBadge status={status} legacy={legacy} />
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            {resultSummary(result, person, project, action)}
                        </Text>
                        {legacy && (
                            <Text size="sm" c="dimmed">
                                Turn on "Limit what agents can do" to set agent
                                capabilities. Other agent settings still apply.
                            </Text>
                        )}
                        {reason && (
                            <Text size="sm" c="dimmed">
                                {reason}
                            </Text>
                        )}
                    </Stack>
                </Group>
            </Paper>
            {result.requiredCapabilities.length > 0 && (
                <Text size="sm" c="dimmed">
                    Needs:{' '}
                    {result.requiredCapabilities
                        .map(getAgentCapabilityName)
                        .join(' + ')}
                </Text>
            )}
            {groups.map((group) => {
                const rows = result.checks.filter(
                    (row) =>
                        group.kinds.includes(row.kind) && isVisibleCheck(row),
                );
                if (!rows.length) return null;
                return (
                    <Stack key={group.label} gap="sm">
                        <Title order={6}>{group.label}</Title>
                        <Stack gap="sm">
                            {rows.map((row) => (
                                <CheckRow
                                    key={row.id}
                                    row={row}
                                    person={person}
                                />
                            ))}
                        </Stack>
                    </Stack>
                );
            })}
        </Stack>
    );
};

const actionOptions = ['operation', 'capability'].map((group) => ({
    group: group === 'operation' ? 'Operations' : 'Capabilities',
    items: AGENT_ACCESS_PREVIEW_ACTIONS.filter(
        (action) => action.group === group,
    ).map((action) => ({ value: action.id, label: action.label })),
}));

export const AgentAccessPreview = ({ dirty }: { dirty: boolean }) => {
    const people = useOrganizationUsers();
    const projects = useProjects();
    const form = useForm<{
        personUuid: string | null;
        projectUuid: string | null;
        actionId: AgentAccessPreviewActionId | null;
    }>({
        initialValues: { personUuid: null, projectUuid: null, actionId: null },
    });
    const preview = useExplainAgentAccess();
    const { hash } = useLocation();
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (hash === '#test-agent-access')
            panel.current?.scrollIntoView({ block: 'start' });
    }, [hash]);
    const { personUuid, projectUuid, actionId } = form.values;
    const person = people.data?.find(
        (candidate) => candidate.userUuid === personUuid,
    );
    const project = projects.data?.find(
        (candidate) => candidate.projectUuid === projectUuid,
    );
    const action = AGENT_ACCESS_PREVIEW_ACTIONS.find(
        (candidate) => candidate.id === actionId,
    );
    const testAccess = () => {
        if (personUuid && projectUuid && actionId)
            preview.mutate({ personUuid, projectUuid, actionId });
    };
    const change = (values: Partial<typeof form.values>) => {
        preview.reset();
        form.setValues(values);
    };
    const personOptions = (people.data ?? []).map((candidate) => ({
        value: candidate.userUuid,
        label:
            [candidate.firstName, candidate.lastName]
                .filter(Boolean)
                .join(' ') || candidate.email,
    }));
    const projectOptions = (projects.data ?? []).map((candidate) => ({
        value: candidate.projectUuid,
        label: candidate.name,
    }));
    return (
        <Box id="test-agent-access" ref={panel}>
            <SettingsCard>
                <Stack gap="lg">
                    <Title order={5}>Test agent access</Title>
                    <Group align="flex-end" className={classes.pickers}>
                        <Select
                            label="Person"
                            placeholder="Choose a person"
                            searchable
                            data={personOptions}
                            value={personUuid}
                            onChange={(value) => change({ personUuid: value })}
                        />
                        <Select
                            label="Project"
                            placeholder="Choose a project"
                            searchable
                            data={projectOptions}
                            value={projectUuid}
                            onChange={(value) => change({ projectUuid: value })}
                        />
                        <Select
                            label="Action"
                            placeholder="Choose an action"
                            data={actionOptions}
                            value={actionId}
                            onChange={(value) =>
                                change({
                                    actionId:
                                        AGENT_ACCESS_PREVIEW_ACTIONS.find(
                                            (candidate) =>
                                                candidate.id === value,
                                        )?.id ?? null,
                                })
                            }
                        />
                        <Button
                            disabled={!personUuid || !projectUuid || !actionId}
                            loading={preview.isLoading}
                            onClick={testAccess}
                        >
                            Test
                        </Button>
                    </Group>
                    {dirty && (
                        <Text size="sm" c="dimmed">
                            This test uses saved permissions. Save your changes
                            to test them.
                        </Text>
                    )}
                    {preview.isIdle && (
                        <Text size="sm" c="dimmed">
                            Choose a person, a project and an action.
                        </Text>
                    )}
                    {preview.isLoading && (
                        <Text size="sm" role="status">
                            Checking saved permissions…
                        </Text>
                    )}
                    {preview.isError && (
                        <Stack gap="xs">
                            <InlineErrorState
                                message="Could not test agent access."
                                onRetry={testAccess}
                            />
                            <Text size="sm" c="dimmed">
                                {preview.error.error.message}
                            </Text>
                        </Stack>
                    )}
                    {preview.data && person && project && action && (
                        <PreviewResult
                            result={preview.data}
                            person={person.firstName || person.email}
                            project={project.name}
                            action={action}
                        />
                    )}
                    <Text size="xs" c="dimmed">
                        This test runs no query and changes nothing. Warehouse
                        access is not verified.
                    </Text>
                </Stack>
            </SettingsCard>
        </Box>
    );
};

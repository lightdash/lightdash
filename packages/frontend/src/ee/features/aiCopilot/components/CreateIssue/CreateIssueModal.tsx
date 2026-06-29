import {
    type AiAgentReviewItemPriority,
    type AiAgentRootCause,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine-8/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconPlus,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC, type FormEvent } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useDashboardQuery } from '../../../../../hooks/dashboard/useDashboard';
import { useProjects } from '../../../../../hooks/useProjects';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import {
    useAiAgentAdminAgents,
    useCreateAiAgentReviewItem,
} from '../../hooks/useAiAgentAdmin';
import { type CreateIssueContext } from '../../store/createIssueSlice';

const rootCauseOptions: { value: AiAgentRootCause; label: string }[] = [
    { value: 'semantic_layer', label: 'Semantic layer' },
    { value: 'project_context', label: 'Project context' },
    { value: 'agent_configuration', label: 'Agent configuration' },
    { value: 'product_capability', label: 'Product capability' },
    { value: 'runtime_reliability', label: 'Runtime reliability' },
    { value: 'feedback_quality', label: 'Feedback quality' },
    { value: 'not_a_failure', label: 'Not a failure' },
    { value: 'ambiguous', label: 'Ambiguous' },
];

const priorityOptions: { value: AiAgentReviewItemPriority; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

type Props = {
    opened: boolean;
    onClose: () => void;
    context: CreateIssueContext | null;
};

// The chip showing which piece of content the issue was filed from. Resolves
// the chart/dashboard name; falls back to a generic label while it loads.
const ReportedFromChip: FC<{ context: CreateIssueContext }> = ({ context }) => {
    const { data: chart } = useSavedQuery({
        uuidOrSlug: context.chartUuid,
        projectUuid: context.projectUuid,
    });
    const { data: dashboard } = useDashboardQuery({
        uuidOrSlug: context.dashboardUuid,
        projectUuid: context.projectUuid,
    });

    if (context.chartUuid) {
        return (
            <Badge
                variant="light"
                color="gray"
                leftSection={<MantineIcon icon={IconChartBar} size={12} />}
            >
                Reported from {chart?.name ?? 'a chart'}
            </Badge>
        );
    }
    if (context.dashboardUuid) {
        return (
            <Badge
                variant="light"
                color="gray"
                leftSection={
                    <MantineIcon icon={IconLayoutDashboard} size={12} />
                }
            >
                Reported from {dashboard?.name ?? 'a dashboard'}
            </Badge>
        );
    }
    return null;
};

export const CreateIssueModal: FC<Props> = ({ opened, onClose, context }) => {
    const { data: projects = [] } = useProjects();
    const { data: agents = [] } = useAiAgentAdminAgents();
    const createIssue = useCreateAiAgentReviewItem();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [projectUuid, setProjectUuid] = useState<string | null>(null);
    const [agentUuid, setAgentUuid] = useState<string | null>(null);
    const [primaryRootCause, setPrimaryRootCause] =
        useState<AiAgentRootCause | null>(null);
    const [priority, setPriority] = useState<AiAgentReviewItemPriority>('none');

    // The content's project is authoritative when launched from a dashboard /
    // tile / chart — lock the select to it. Re-seed whenever the modal opens
    // against a new context (keyed on open + projectUuid, not on every render).
    useEffect(() => {
        if (opened && context?.projectUuid) {
            setProjectUuid(context.projectUuid);
        }
    }, [opened, context?.projectUuid]);

    const projectLocked = !!context?.projectUuid;

    const agentOptions = useMemo(
        () =>
            agents
                .filter(
                    (agent) =>
                        !projectUuid || agent.projectUuid === projectUuid,
                )
                .map((agent) => ({ value: agent.uuid, label: agent.name })),
        [agents, projectUuid],
    );

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setProjectUuid(context?.projectUuid ?? null);
        setAgentUuid(null);
        setPrimaryRootCause(null);
        setPriority('none');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!projectUuid || title.trim().length === 0) return;
        createIssue.mutate(
            {
                title: title.trim(),
                description: description.trim() || null,
                projectUuid,
                agentUuid,
                assignedToUserUuid: null,
                primaryRootCause,
                priority,
            },
            {
                onSuccess: () => {
                    resetForm();
                    onClose();
                },
            },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="New issue"
            icon={IconPlus}
            size="lg"
        >
            <form onSubmit={handleSubmit}>
                <Stack gap="sm">
                    {context &&
                        (context.chartUuid || context.dashboardUuid) && (
                            <Group gap="xs">
                                <ReportedFromChip context={context} />
                            </Group>
                        )}
                    <TextInput
                        label="Title"
                        value={title}
                        onChange={(event) =>
                            setTitle(event.currentTarget.value)
                        }
                        required
                        autoFocus
                    />
                    <Textarea
                        label="Description"
                        description="Describe the gap or fix, and the outcome you want."
                        value={description}
                        onChange={(event) =>
                            setDescription(event.currentTarget.value)
                        }
                        minRows={4}
                    />
                    <Select
                        label="Project"
                        data={projects.map((project) => ({
                            value: project.projectUuid,
                            label: project.name,
                        }))}
                        value={projectUuid}
                        onChange={(value) => {
                            setProjectUuid(value);
                            setAgentUuid(null);
                        }}
                        searchable
                        required
                        disabled={projectLocked}
                    />
                    <Select
                        label="Agent"
                        data={agentOptions}
                        value={agentUuid}
                        onChange={setAgentUuid}
                        searchable
                        clearable
                        disabled={!projectUuid}
                    />
                    <Select
                        label="Root cause"
                        data={rootCauseOptions}
                        value={primaryRootCause}
                        onChange={(value) =>
                            setPrimaryRootCause(
                                value as AiAgentRootCause | null,
                            )
                        }
                        clearable
                    />
                    <Select
                        label="Priority"
                        data={priorityOptions}
                        value={priority}
                        onChange={(value) =>
                            setPriority(
                                (value ?? 'none') as AiAgentReviewItemPriority,
                            )
                        }
                    />
                    <Group justify="flex-end">
                        <Button
                            variant="subtle"
                            color="gray"
                            onClick={handleClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            loading={createIssue.isLoading}
                            disabled={!projectUuid || !title.trim()}
                        >
                            Create issue
                        </Button>
                    </Group>
                </Stack>
            </form>
        </MantineModal>
    );
};

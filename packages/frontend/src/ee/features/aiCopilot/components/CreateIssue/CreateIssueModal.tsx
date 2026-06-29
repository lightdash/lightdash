import {
    type AiAgentReviewItemPriority,
    type AiAgentRootCause,
    type AiAgentTargetRef,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    MultiSelect,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine-8/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconPlus,
    IconWand,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type FormEvent } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useDashboardQuery } from '../../../../../hooks/dashboard/useDashboard';
import { useExplores } from '../../../../../hooks/useExplores';
import { useProjects } from '../../../../../hooks/useProjects';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import {
    useAiAgentAdminAgents,
    useCreateAiAgentReviewItem,
} from '../../hooks/useAiAgentAdmin';
import { useAiRouterRoute } from '../../hooks/useAiRouter';
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
    const routeAgent = useAiRouterRoute();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    // The host mounts this modal fresh on each open, so seeding from the
    // launch context in the initializer is enough — no effect-sync needed.
    const [projectUuid, setProjectUuid] = useState<string | null>(
        context?.projectUuid ?? null,
    );
    const [agentUuid, setAgentUuid] = useState<string | null>(null);
    const [targetExploreNamesOverride, setTargetExploreNamesOverride] =
        useState<string[] | null>(null);
    const [suggestionReasoning, setSuggestionReasoning] = useState<
        string | null
    >(null);
    const [primaryRootCause, setPrimaryRootCause] =
        useState<AiAgentRootCause | null>(null);
    const [priority, setPriority] = useState<AiAgentReviewItemPriority>('none');

    const { data: explores = [] } = useExplores(projectUuid ?? undefined);
    const { data: seedChart } = useSavedQuery({
        uuidOrSlug: context?.chartUuid,
        projectUuid: context?.projectUuid,
    });

    // Seed the related explores with the chart's base explore when filing from
    // a chart, so the writeback starts from the right model. Derived, not
    // effect-synced: once the user edits the multiselect their override wins,
    // so a late-resolving chart query can't clobber it.
    const targetExploreNames =
        targetExploreNamesOverride ??
        (seedChart?.tableName ? [seedChart.tableName] : []);

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

    const exploreOptions = useMemo(
        () =>
            explores.map((explore) => ({
                value: explore.name,
                label: explore.label,
            })),
        [explores],
    );

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setProjectUuid(context?.projectUuid ?? null);
        setAgentUuid(null);
        setTargetExploreNamesOverride(null);
        setSuggestionReasoning(null);
        setPrimaryRootCause(null);
        setPriority('none');
    };

    // Reuse the AI router to pick the best-fit agent from the issue title +
    // description, then pre-select it (the user can still override).
    const handleSuggestAgent = () => {
        if (!projectUuid || title.trim().length === 0) return;
        const prompt = [title.trim(), description.trim()]
            .filter(Boolean)
            .join('\n\n');
        routeAgent.mutate(
            { prompt, projectUuid },
            {
                onSuccess: (result) => {
                    setAgentUuid(result.decision.suggestedAgentUuid);
                    setSuggestionReasoning(result.decision.reasoning);
                },
            },
        );
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!projectUuid || title.trim().length === 0) return;
        const targetRefs: AiAgentTargetRef[] = targetExploreNames.map(
            (name) => ({ type: 'explore', modelName: name, exploreName: name }),
        );
        createIssue.mutate(
            {
                title: title.trim(),
                description: description.trim() || null,
                projectUuid,
                agentUuid,
                assignedToUserUuid: null,
                primaryRootCause,
                priority,
                targetRefs,
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
                            setTargetExploreNamesOverride([]);
                        }}
                        searchable
                        required
                        disabled={projectLocked}
                    />
                    <MultiSelect
                        label="Related explores"
                        description="Which models this issue is about — guides the fix."
                        data={exploreOptions}
                        value={targetExploreNames}
                        onChange={setTargetExploreNamesOverride}
                        searchable
                        clearable
                        disabled={!projectUuid}
                        nothingFoundMessage="No explores"
                    />
                    <Stack gap={4}>
                        <Group
                            justify="space-between"
                            align="flex-end"
                            gap="xs"
                        >
                            <Select
                                label="Agent"
                                data={agentOptions}
                                value={agentUuid}
                                onChange={(value) => {
                                    setAgentUuid(value);
                                    setSuggestionReasoning(null);
                                }}
                                searchable
                                clearable
                                disabled={!projectUuid}
                                flex={1}
                            />
                            {agentOptions.length > 0 && (
                                <Button
                                    variant="subtle"
                                    size="compact-sm"
                                    leftSection={
                                        <MantineIcon icon={IconWand} />
                                    }
                                    loading={routeAgent.isLoading}
                                    disabled={!projectUuid || !title.trim()}
                                    onClick={handleSuggestAgent}
                                >
                                    Suggest
                                </Button>
                            )}
                        </Group>
                        {suggestionReasoning && (
                            <Text c="dimmed" fz="xs">
                                Suggested: {suggestionReasoning}
                            </Text>
                        )}
                    </Stack>
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

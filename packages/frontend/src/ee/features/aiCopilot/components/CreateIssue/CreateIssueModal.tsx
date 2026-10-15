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
} from '@mantine/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    IconPlus,
    IconWand,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useMemo, useState, type FC, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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

const getRootCauseOptions = (
    t: TFunction,
): { value: AiAgentRootCause; label: string }[] => [
    {
        value: 'semantic_layer',
        label: t('createIssue.rootCause.semanticLayer'),
    },
    {
        value: 'project_context',
        label: t('createIssue.rootCause.projectContext'),
    },
    {
        value: 'agent_configuration',
        label: t('createIssue.rootCause.agentConfiguration'),
    },
    {
        value: 'runtime_reliability',
        label: t('createIssue.rootCause.runtimeReliability'),
    },
    {
        value: 'feedback_quality',
        label: t('createIssue.rootCause.feedbackQuality'),
    },
    { value: 'not_a_failure', label: t('createIssue.rootCause.notAFailure') },
    { value: 'ambiguous', label: t('createIssue.rootCause.ambiguous') },
];

const getPriorityOptions = (
    t: TFunction,
): { value: AiAgentReviewItemPriority; label: string }[] => [
    { value: 'none', label: t('createIssue.priority.none') },
    { value: 'urgent', label: t('createIssue.priority.urgent') },
    { value: 'high', label: t('createIssue.priority.high') },
    { value: 'medium', label: t('createIssue.priority.medium') },
    { value: 'low', label: t('createIssue.priority.low') },
];

type Props = {
    opened: boolean;
    onClose: () => void;
    context: CreateIssueContext | null;
};

// The chip showing which piece of content the issue was filed from. Resolves
// the chart/dashboard name; falls back to a generic label while it loads.
const ReportedFromChip: FC<{ context: CreateIssueContext }> = ({ context }) => {
    const { t } = useTranslation('aiAgent');
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
            <Badge leftSection={<MantineIcon icon={IconChartBar} size={12} />}>
                {chart?.name
                    ? t('createIssue.reportedFrom', { name: chart.name })
                    : t('createIssue.reportedFromChart')}
            </Badge>
        );
    }
    if (context.dashboardUuid) {
        return (
            <Badge
                leftSection={
                    <MantineIcon icon={IconLayoutDashboard} size={12} />
                }
            >
                {dashboard?.name
                    ? t('createIssue.reportedFrom', { name: dashboard.name })
                    : t('createIssue.reportedFromDashboard')}
            </Badge>
        );
    }
    return null;
};

export const CreateIssueModal: FC<Props> = ({ opened, onClose, context }) => {
    const { t } = useTranslation('aiAgent');
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
        // Persist which content the issue was filed from, not just its explores.
        if (context && (context.chartUuid || context.dashboardUuid)) {
            targetRefs.push({
                type: 'content',
                chartUuid: context.chartUuid ?? null,
                dashboardUuid: context.dashboardUuid ?? null,
                tileUuid: context.tileUuid ?? null,
            });
        }
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
            title={t('createIssue.title')}
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
                        label={t('createIssue.fields.title')}
                        value={title}
                        onChange={(event) =>
                            setTitle(event.currentTarget.value)
                        }
                        required
                        autoFocus
                    />
                    <Textarea
                        label={t('createIssue.fields.description')}
                        description={t('createIssue.fields.descriptionHelp')}
                        value={description}
                        onChange={(event) =>
                            setDescription(event.currentTarget.value)
                        }
                        minRows={4}
                    />
                    <Select
                        label={t('createIssue.fields.project')}
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
                        label={t('createIssue.fields.relatedExplores')}
                        description={t(
                            'createIssue.fields.relatedExploresHelp',
                        )}
                        data={exploreOptions}
                        value={targetExploreNames}
                        onChange={setTargetExploreNamesOverride}
                        searchable
                        clearable
                        disabled={!projectUuid}
                        nothingFoundMessage={t('createIssue.fields.noExplores')}
                    />
                    <Stack gap={4}>
                        <Group
                            justify="space-between"
                            align="flex-end"
                            gap="xs"
                        >
                            <Select
                                label={t('createIssue.fields.agent')}
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
                                    {t('createIssue.suggest')}
                                </Button>
                            )}
                        </Group>
                        {suggestionReasoning && (
                            <Text c="dimmed" fz="xs">
                                {t('createIssue.suggested', {
                                    reasoning: suggestionReasoning,
                                })}
                            </Text>
                        )}
                    </Stack>
                    <Select
                        label={t('createIssue.fields.rootCause')}
                        data={getRootCauseOptions(t)}
                        value={primaryRootCause}
                        onChange={(value) =>
                            setPrimaryRootCause(
                                value as AiAgentRootCause | null,
                            )
                        }
                        clearable
                    />
                    <Select
                        label={t('createIssue.fields.priority')}
                        data={getPriorityOptions(t)}
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
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                        <Button
                            type="submit"
                            loading={createIssue.isLoading}
                            disabled={!projectUuid || !title.trim()}
                        >
                            {t('createIssue.submit')}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </MantineModal>
    );
};

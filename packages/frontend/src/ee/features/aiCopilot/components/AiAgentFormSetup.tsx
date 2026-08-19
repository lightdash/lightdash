import { subject } from '@casl/ability';
import {
    FeatureFlags,
    MAX_RETENTION_WINDOW_HOURS,
    MIN_RETENTION_WINDOW_HOURS,
    type AiAgentModelConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Card,
    Code,
    Collapse,
    Divider,
    FileButton,
    Group,
    LoadingOverlay,
    MultiSelect,
    Paper,
    Radio,
    Select,
    Stack,
    Switch,
    TagsInput,
    Text,
    Textarea,
    type TextareaProps,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { type useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconBook2,
    IconCode,
    IconId,
    IconInfoCircle,
    IconLock,
    IconPlug,
    IconPointFilled,
    IconSparkles,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { BetaBadge } from '../../../../components/common/BetaBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { getModelKey } from '../../../../components/common/ModelSelector/utils';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useOrganizationGroups } from '../../../../hooks/useOrganizationGroups';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { UserAccessMultiSelect } from '../../../components/UserAccessMultiSelect';
import AiExploreAccessTree from '../../../pages/AiAgents/AiExploreAccessTree';
import {
    getAiAgentModelConfig,
    getModelOptionByKey,
    useDefaultAiAgentModel,
} from '../hooks/useAiAgentModelSelection';
import { useAiOrganizationSettings } from '../hooks/useAiOrganizationSettings';
import { useDeleteAiAgentMutation } from '../hooks/useProjectAiAgents';
import { useGetAgentExploreAccessSummary } from '../hooks/useUserAgentPreferences';
import { AgentSettingsSection } from './AgentSettingsSection';
import { AgentSettingsSubsection } from './AgentSettingsSubsection';
import AiAgentAsCodeModal from './AiAgentAsCodeModal';
import classes from './AiAgentFormSetup.module.css';
import { AiAgentKnowledgeFilesSection } from './AiAgentKnowledgeFilesSection';
import { AiAgentMcpServersInput } from './AiAgentMcpServersInput';
import { InstructionsGuidelines } from './InstructionsSupport';
import { SpaceAccessSelect } from './SpaceAccessSelect';
import { ThreadRetentionSelect } from './ThreadRetentionSelect';

const formSchema = z.object({
    name: z.string().min(1),
    description: z.string().nullable(),
    integrations: z.array(
        z.object({
            type: z.literal('slack'),
            channelId: z.string().min(1),
        }),
    ),
    tags: z.array(z.string()).nullable(),
    instruction: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
    groupAccess: z.array(z.string()),
    userAccess: z.array(z.string()),
    spaceAccess: z.array(z.string()),
    mcpServerUuids: z.array(z.string()),
    enableDataAccess: z.boolean(),
    enableSelfImprovement: z.boolean(),
    enableContentTools: z.boolean(),
    enableUserContext: z.boolean(),
    enableSqlMode: z.boolean(),
    adminOnly: z.boolean(),
    modelConfig: z.custom<AiAgentModelConfig>().nullable(),
    version: z.number(),
    threadRetentionHours: z
        .number()
        .int()
        .min(MIN_RETENTION_WINDOW_HOURS)
        .max(MAX_RETENTION_WINDOW_HOURS)
        .nullable(),
});

type CommitOnBlurTextareaProps = Omit<
    TextareaProps,
    'defaultValue' | 'value' | 'onChange'
> & {
    defaultValue: string;
    onCommit: (value: string) => void;
};

const SwitchLabel = ({
    text,
    help,
    badge,
}: {
    text: string;
    help: string;
    badge: ReactNode | null;
}) => (
    <Group gap="xxs" align="center" wrap="nowrap">
        <Text fz="sm" fw={500}>
            {text}
        </Text>
        {badge}
        {/* The class lifts the icon above the switch's full-row input overlay,
            which would otherwise swallow the pointer before it reaches here. */}
        <Tooltip
            label={help}
            events={{ hover: true, focus: true, touch: true }}
            withArrow
            withinPortal
            multiline
            position="right"
            maw="300px"
        >
            <ActionIcon
                type="button"
                variant="subtle"
                color="ldGray"
                size="xs"
                aria-label={help}
                className={classes.switchHelpIcon}
                onClick={(event) => event.preventDefault()}
            >
                <MantineIcon icon={IconInfoCircle} size="sm" />
            </ActionIcon>
        </Tooltip>
    </Group>
);

const CommitOnBlurTextarea = memo(
    ({ defaultValue, onCommit, ...props }: CommitOnBlurTextareaProps) => (
        <Textarea
            defaultValue={defaultValue}
            onBlur={(e) => onCommit(e.currentTarget.value)}
            {...props}
        />
    ),
);

export const AiAgentFormSetup = ({
    mode,
    form,
    projectUuid,
    agentUuid,
    isSavingAgent,
    onSubmit,
    persistedMcpServerUuids,
    avatarMode,
    avatarFileName,
    onAvatarFileChange,
    onAvatarModeChange,
    onAvatarRemove,
    onAvatarRevert,
}: {
    mode: 'create' | 'edit';
    form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
    projectUuid: string;
    agentUuid?: string;
    isSavingAgent?: boolean;
    onSubmit: () => void;
    persistedMcpServerUuids?: string[];
    avatarMode: 'upload' | 'link';
    avatarFileName: string | null;
    onAvatarFileChange: (file: File | null) => void;
    onAvatarModeChange: (mode: 'upload' | 'link') => void;
    onAvatarRemove: () => void;
    onAvatarRevert: (() => void) | null;
}) => {
    const { data: aiOrganizationSettings } = useAiOrganizationSettings();
    const modelOptions = aiOrganizationSettings?.defaultAiAgentModelOptions;
    const exploreAccessSummaryQuery = useGetAgentExploreAccessSummary(
        projectUuid!,
        {
            tags: form.values.tags,
        },
    );

    const { mutateAsync: deleteAgent } = useDeleteAiAgentMutation(projectUuid!);

    const { user } = useApp();
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isAsCodeModalOpen, asCodeModalHandlers] = useDisclosure(false);

    const canViewContentAsCode = !!user.data?.ability.can(
        'view',
        subject('ContentAsCode', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );

    const scrollToKnowledgeAndData = useCallback(() => {
        document
            .getElementById('knowledge-and-data')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const handleDeleteClick = useCallback(() => {
        setDeleteModalOpen(true);
    }, []);
    const handleCancelDelete = useCallback(() => {
        setDeleteModalOpen(false);
    }, []);
    const handleDelete = useCallback(async () => {
        if (!agentUuid || !user?.data || !projectUuid) {
            return;
        }

        await deleteAgent(agentUuid);

        setDeleteModalOpen(false);
    }, [agentUuid, deleteAgent, user?.data, projectUuid]);

    const [isExploreAccessSummaryOpen, { toggle: toggleExploreAccessSummary }] =
        useDisclosure(false);
    const {
        fallbackModelLabel: organizationDefaultModelLabel,
        selectedModel,
        selectedModelKey,
        showReasoningDefault,
        visibleModelOptions,
    } = useDefaultAiAgentModel({
        modelOptions,
        modelConfig: form.values.modelConfig,
        fallbackModelConfig: aiOrganizationSettings?.defaultAiAgentModelConfig,
        fallbackLabel: 'Organization default',
    });
    const slackChannelsConfigured = useMemo(
        () =>
            form.values.integrations.some(
                (i) => i.type === 'slack' && i.channelId,
            ),
        [form.values.integrations],
    );
    const { data: slackInstallation, isLoading: isLoadingSlackInstallation } =
        useGetSlack();

    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const threadRetentionFlagQuery = useServerFeatureFlag(
        FeatureFlags.AiThreadRetention,
    );

    const isGroupsEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    const handlePersistedMcpServerChange = useCallback(
        (value: string[]) => {
            const dirtyFields = Object.keys(form.values).reduce<
                Record<string, boolean>
            >((acc, field) => {
                if (
                    field !== 'mcpServerUuids' &&
                    form.isDirty(field as keyof typeof form.values)
                ) {
                    acc[field] = true;
                }

                return acc;
            }, {});

            form.resetDirty({
                ...form.values,
                mcpServerUuids: value,
            });
            form.setDirty(dirtyFields);
        },
        [form],
    );

    const { data: groups, isLoading: isLoadingGroups } = useOrganizationGroups(
        {
            includeMembers: 5,
        },
        {
            enabled: isGroupsEnabled,
        },
    );

    const groupOptions = useMemo(
        () =>
            groups?.map((group) => ({
                value: group.uuid,
                label: group.name,
            })) ?? [],
        [groups],
    );

    // UI-only: keeps "Specific users & groups" selected after the user picks it
    // but before they add anyone (otherwise empty lists would read as "Everyone").
    const [showSpecificAccess, setShowSpecificAccess] = useState(false);

    const accessMode: 'everyone' | 'admins' | 'specific' = form.values.adminOnly
        ? 'admins'
        : showSpecificAccess ||
            form.values.userAccess.length > 0 ||
            form.values.groupAccess.length > 0
          ? 'specific'
          : 'everyone';

    const handleAccessModeChange = useCallback(
        (mode: string) => {
            if (mode === 'admins') {
                setShowSpecificAccess(false);
                form.setFieldValue('adminOnly', true);
                form.setFieldValue('userAccess', []);
                form.setFieldValue('groupAccess', []);
            } else if (mode === 'specific') {
                setShowSpecificAccess(true);
                form.setFieldValue('adminOnly', false);
            } else {
                setShowSpecificAccess(false);
                form.setFieldValue('adminOnly', false);
                form.setFieldValue('userAccess', []);
                form.setFieldValue('groupAccess', []);
            }
        },
        [form],
    );

    return (
        <>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit();
                }}
            >
                <Stack gap="sm">
                    <AgentSettingsSection
                        id="identity"
                        icon={IconId}
                        title="Identity"
                        description="How this agent introduces itself wherever it appears."
                        action={
                            mode === 'edit' &&
                            agentUuid &&
                            canViewContentAsCode ? (
                                <Button
                                    variant="default"
                                    size="xs"
                                    onClick={asCodeModalHandlers.open}
                                    leftSection={
                                        <MantineIcon icon={IconCode} />
                                    }
                                >
                                    View as code
                                </Button>
                            ) : null
                        }
                    >
                        <TextInput
                            label="Name"
                            placeholder="Enter a name for this agent"
                            variant="subtle"
                            {...form.getInputProps('name')}
                        />
                        <CommitOnBlurTextarea
                            key={`description-${
                                form.values.description != null
                            }`}
                            variant="subtle"
                            label="Description"
                            description="A brief description of what this agent does and its purpose."
                            placeholder="Describe what this agent specializes in..."
                            minRows={3}
                            maxRows={6}
                            error={form.errors.description}
                            defaultValue={form.values.description ?? ''}
                            onCommit={(value) =>
                                form.setFieldValue(
                                    'description',
                                    value ? value : null,
                                )
                            }
                        />
                        <Box>
                            <Text size="sm" fw={500}>
                                Avatar
                            </Text>
                            <Text size="xs" c="dimmed" mt={2}>
                                Upload an image (PNG, JPG, GIF) or use an image
                                URL. Images are cropped to a square; a default
                                avatar is used if none is set.
                            </Text>

                            {avatarMode === 'link' ? (
                                <TextInput
                                    mt="sm"
                                    variant="subtle"
                                    label="Avatar image URL"
                                    placeholder="https://example.com/avatar.jpg"
                                    type="url"
                                    {...form.getInputProps('imageUrl')}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        form.setFieldValue(
                                            'imageUrl',
                                            value ? value : null,
                                        );
                                    }}
                                />
                            ) : (
                                <Group align="center" gap="sm" mt="sm">
                                    <FileButton
                                        accept="image/png,image/jpeg,image/gif"
                                        onChange={onAvatarFileChange}
                                    >
                                        {(props) => (
                                            <Button
                                                {...props}
                                                size="xs"
                                                variant="light"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconUpload}
                                                    />
                                                }
                                            >
                                                Upload image
                                            </Button>
                                        )}
                                    </FileButton>
                                    {avatarFileName !== null && (
                                        <Text size="xs" c="dimmed">
                                            {avatarFileName}
                                        </Text>
                                    )}
                                </Group>
                            )}

                            <Group gap="md" mt="xs">
                                <Anchor
                                    component="button"
                                    type="button"
                                    size="xs"
                                    c="dimmed"
                                    onClick={() =>
                                        onAvatarModeChange(
                                            avatarMode === 'link'
                                                ? 'upload'
                                                : 'link',
                                        )
                                    }
                                >
                                    {avatarMode === 'link'
                                        ? 'Upload an image instead'
                                        : 'Use an image URL instead'}
                                </Anchor>
                                {onAvatarRevert !== null && (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        size="xs"
                                        c="dimmed"
                                        onClick={onAvatarRevert}
                                    >
                                        Revert
                                    </Anchor>
                                )}
                                {(avatarFileName !== null ||
                                    form.values.imageUrl) && (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        size="xs"
                                        c="red"
                                        onClick={onAvatarRemove}
                                    >
                                        Remove
                                    </Anchor>
                                )}
                            </Group>
                        </Box>
                    </AgentSettingsSection>

                    <AgentSettingsSection
                        id="behaviour"
                        icon={IconSparkles}
                        title="Behaviour"
                        description="How the agent answers, and which model it thinks with."
                    >
                        <CommitOnBlurTextarea
                            key={`instruction-${
                                form.values.instruction != null
                            }`}
                            variant="subtle"
                            label="Instructions"
                            description="Set the overall behavior and task for the agent. This defines how it should respond and what its purpose is."
                            placeholder="You are a marketing analytics expert. Focus on campaign performance, customer acquisition costs, and ROI metrics. Always use bar charts and tables to visualize data."
                            resize="vertical"
                            autosize
                            minRows={3}
                            maxRows={8}
                            error={form.errors.instruction}
                            defaultValue={form.values.instruction ?? ''}
                            onCommit={(value) =>
                                form.setFieldValue(
                                    'instruction',
                                    value ? value : null,
                                )
                            }
                        />
                        <Stack gap="sm">
                            <Box>
                                <Title
                                    order={6}
                                    c="ldGray.7"
                                    size="sm"
                                    fw={500}
                                >
                                    Guidelines
                                </Title>
                                <Text c="dimmed" size="xs">
                                    When writing instructions, consider the
                                    following guidelines to help the agent
                                    perform its tasks effectively.
                                </Text>
                            </Box>
                            <InstructionsGuidelines />
                            <Text c="dimmed" size="xs">
                                Visit our{' '}
                                <Anchor
                                    href="https://docs.lightdash.com/guides/ai-agents#writing-effective-instructions"
                                    target="_blank"
                                >
                                    docs
                                </Anchor>{' '}
                                to learn more about instructions and how they
                                work.
                            </Text>
                        </Stack>

                        <Divider />

                        <Select
                            variant="subtle"
                            label="Default model"
                            description="Used for new chats with this agent. Users can still change it in each chat."
                            value={selectedModelKey}
                            disabled={isSavingAgent || !modelOptions?.length}
                            placeholder={organizationDefaultModelLabel}
                            clearable
                            data={visibleModelOptions.map((model) => ({
                                value: getModelKey(model),
                                label: model.displayName,
                            }))}
                            onChange={(modelKey) => {
                                const model = getModelOptionByKey(
                                    modelOptions,
                                    modelKey,
                                );
                                form.setFieldValue(
                                    'modelConfig',
                                    model
                                        ? (getAiAgentModelConfig(
                                              model,
                                              form.values.modelConfig
                                                  ?.reasoning ??
                                                  aiOrganizationSettings
                                                      ?.defaultAiAgentModelConfig
                                                      ?.reasoning ??
                                                  false,
                                          ) ?? null)
                                        : null,
                                );
                            }}
                        />

                        {showReasoningDefault && (
                            <Switch
                                variant="subtle"
                                label="High reasoning"
                                description="Use high reasoning for new chats with this agent."
                                checked={
                                    form.values.modelConfig?.reasoning === true
                                }
                                disabled={isSavingAgent}
                                onChange={(event) => {
                                    if (!selectedModel) return;
                                    form.setFieldValue('modelConfig', {
                                        ...form.values.modelConfig,
                                        modelName: selectedModel.name,
                                        modelProvider: selectedModel.provider,
                                        reasoning: event.currentTarget.checked,
                                    });
                                }}
                            />
                        )}
                    </AgentSettingsSection>

                    <AgentSettingsSection
                        id="knowledge-and-data"
                        icon={IconBook2}
                        title="Knowledge & data"
                        description="What this agent can look at when it answers."
                    >
                        <AgentSettingsSubsection
                            title="Reference documents"
                            description="Retrieved when relevant, or always included per file. A short summary is generated for each file."
                        >
                            {agentUuid ? (
                                <AiAgentKnowledgeFilesSection
                                    agentUuid={agentUuid}
                                    projectUuid={projectUuid}
                                    withHeading={false}
                                />
                            ) : (
                                <Paper variant="dotted" p="sm">
                                    <Text size="xs" c="dimmed" ta="center">
                                        You can upload documents once this agent
                                        is created.
                                    </Text>
                                </Paper>
                            )}
                        </AgentSettingsSubsection>

                        <Divider />

                        <AgentSettingsSubsection
                            title="Explores"
                            description={
                                <>
                                    Limit which explores, metrics and dimensions
                                    the agent can query, by tag. Leave empty to
                                    allow all of them.{' '}
                                    <Anchor
                                        fz="xs"
                                        href="https://docs.lightdash.com/guides/ai-agents#limiting-access-to-specific-explores-and-fields"
                                        target="_blank"
                                    >
                                        Learn more
                                    </Anchor>
                                </>
                            }
                        >
                            <Box>
                                <TagsInput
                                    variant="subtle"
                                    aria-label="Explore tags"
                                    placeholder="Select tags"
                                    inputWrapperOrder={[
                                        'label',
                                        'input',
                                        'description',
                                    ]}
                                    description={
                                        exploreAccessSummaryQuery.isSuccess ? (
                                            exploreAccessSummaryQuery.data
                                                .length === 0 ? (
                                                'No explorers are available for this tag selection. Make sure to use the correct tags, or tag the project with the correct tags and redeploy the project.'
                                            ) : (
                                                <>
                                                    {
                                                        exploreAccessSummaryQuery
                                                            .data.length
                                                    }{' '}
                                                    explores will be available
                                                    to this agent.{' '}
                                                    <Anchor
                                                        size="xs"
                                                        onClick={
                                                            toggleExploreAccessSummary
                                                        }
                                                    >
                                                        Click here
                                                    </Anchor>{' '}
                                                    to see detailed list with
                                                    metrics and dimensions.
                                                </>
                                            )
                                        ) : (
                                            `Loading AI access information...`
                                        )
                                    }
                                    {...form.getInputProps('tags')}
                                    value={
                                        form.getInputProps('tags').value ?? []
                                    }
                                    onChange={(value) => {
                                        form.setFieldValue(
                                            'tags',
                                            value.length > 0 ? value : null,
                                        );
                                    }}
                                />

                                {exploreAccessSummaryQuery.isSuccess ? (
                                    <Collapse
                                        mt="xs"
                                        in={isExploreAccessSummaryOpen}
                                    >
                                        <Card>
                                            <AiExploreAccessTree
                                                exploreAccessSummary={
                                                    exploreAccessSummaryQuery.data
                                                }
                                            />
                                        </Card>
                                    </Collapse>
                                ) : null}
                            </Box>
                        </AgentSettingsSubsection>

                        <Divider />

                        <AgentSettingsSubsection
                            title="Spaces"
                            description="Restrict which saved charts and dashboards the agent can read. Empty selection means all spaces."
                        >
                            <SpaceAccessSelect
                                projectUuid={projectUuid}
                                value={form.values.spaceAccess}
                                onChange={(value) => {
                                    form.setFieldValue('spaceAccess', value);
                                }}
                            />
                        </AgentSettingsSubsection>
                    </AgentSettingsSection>

                    <AgentSettingsSection
                        id="permissions"
                        icon={IconLock}
                        title="Permissions"
                        description="What the agent may do, and who may use it."
                    >
                        <AgentSettingsSubsection title="The agent can">
                            <Stack gap="md">
                                <Switch
                                    variant="subtle"
                                    label={
                                        <SwitchLabel
                                            text="Read the rows behind a chart"
                                            help="When enabled, the agent can analyze chart data and provide insights. When disabled, it only builds visualizations, without reading the data behind them."
                                            badge={null}
                                        />
                                    }
                                    description={
                                        <>
                                            Query the underlying data, not just
                                            the chart.{' '}
                                            <Anchor
                                                href="https://docs.lightdash.com/guides/ai-agents#data-access-control"
                                                target="_blank"
                                                size="xs"
                                                className={classes.switchLink}
                                            >
                                                Learn more
                                            </Anchor>
                                        </>
                                    }
                                    {...form.getInputProps('enableDataAccess', {
                                        type: 'checkbox',
                                    })}
                                    onChange={(event) => {
                                        const enabled =
                                            event.currentTarget.checked;

                                        form.setFieldValue(
                                            'enableDataAccess',
                                            enabled,
                                        );

                                        if (!enabled) {
                                            form.setFieldValue(
                                                'enableContentTools',
                                                false,
                                            );
                                        }
                                    }}
                                />
                                <Switch
                                    variant="subtle"
                                    label={
                                        <SwitchLabel
                                            text="Create and edit content"
                                            help="Requires reading rows to be enabled. Only works for users with content-as-code access (admins, developers, and editors)."
                                            badge={<BetaBadge />}
                                        />
                                    }
                                    description="Build or change dashboards, charts and scheduled deliveries."
                                    {...form.getInputProps(
                                        'enableContentTools',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                    disabled={!form.values.enableDataAccess}
                                />
                                <Switch
                                    variant="subtle"
                                    label={
                                        <SwitchLabel
                                            text="Run SQL against the warehouse"
                                            help="SQL Runner is only available to users whose role includes SQL Runner access (project developers and admins by default). This setting never grants permission: users without access cannot use SQL Runner, whether this is on or off."
                                            badge={null}
                                        />
                                    }
                                    description={
                                        <>
                                            On by default in new chats; users
                                            can switch it off per conversation.{' '}
                                            <Anchor
                                                component={Link}
                                                to={`/generalSettings/projectManagement/${projectUuid}/agentDataScope`}
                                                size="xs"
                                                className={classes.switchLink}
                                            >
                                                Configure which schemas and
                                                tables it can query
                                            </Anchor>
                                        </>
                                    }
                                    {...form.getInputProps('enableSqlMode', {
                                        type: 'checkbox',
                                    })}
                                />
                                <Switch
                                    variant="subtle"
                                    label={
                                        <SwitchLabel
                                            text="See user information"
                                            help="Only applies when the agent knows who is asking — on Slack this requires the OAuth requirement to be enabled in the organization's Slack settings."
                                            badge={null}
                                        />
                                    }
                                    description="Shares the requesting user's name, role and group memberships, so answers can be tailored to who is asking."
                                    {...form.getInputProps(
                                        'enableUserContext',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                />
                            </Stack>

                            <Text size="xs" c="dimmed">
                                Which explores, spaces and documents it can read
                                is set in{' '}
                                <Anchor
                                    component="button"
                                    type="button"
                                    size="xs"
                                    onClick={scrollToKnowledgeAndData}
                                >
                                    Knowledge &amp; data
                                </Anchor>
                                .
                            </Text>
                        </AgentSettingsSubsection>

                        {threadRetentionFlagQuery.data?.enabled && (
                            <>
                                <Divider />
                                <AgentSettingsSubsection
                                    title="Conversation retention"
                                    description={`Delete this agent's conversations after a period of inactivity. Active conversations are never cut off.${
                                        aiOrganizationSettings?.threadRetentionHours !=
                                        null
                                            ? ' The organization retention policy caps this setting.'
                                            : ''
                                    }`}
                                >
                                    <ThreadRetentionSelect
                                        value={form.values.threadRetentionHours}
                                        ceilingHours={
                                            aiOrganizationSettings?.threadRetentionHours ??
                                            null
                                        }
                                        onChange={(hours) =>
                                            form.setFieldValue(
                                                'threadRetentionHours',
                                                hours,
                                            )
                                        }
                                    />
                                </AgentSettingsSubsection>
                            </>
                        )}

                        <Divider />

                        <AgentSettingsSubsection title="Who can use it">
                            <Stack gap="md">
                                <Radio.Group
                                    value={accessMode}
                                    onChange={handleAccessModeChange}
                                >
                                    <Stack gap="sm">
                                        <Radio
                                            value="everyone"
                                            label="Everyone in the project"
                                            description="All project members can see and use this agent."
                                        />
                                        <Radio
                                            value="admins"
                                            label="Admins & developers only"
                                            description="Hidden from everyone else — useful while setting up or testing the agent."
                                        />
                                        <Radio
                                            value="specific"
                                            label={`Specific users ${isGroupsEnabled ? ' & groups' : ''}`}
                                            description={`Only the users${isGroupsEnabled ? ' and groups ' : ' '}you choose. Admins and developers (Manage AI Agents scope) always have access.`}
                                        />
                                    </Stack>
                                </Radio.Group>

                                {accessMode === 'specific' && (
                                    <Stack pl="xl">
                                        <UserAccessMultiSelect
                                            projectUuid={projectUuid!}
                                            isGroupsEnabled={isGroupsEnabled}
                                            value={form.values.userAccess}
                                            onChange={(value) => {
                                                form.setFieldValue(
                                                    'userAccess',
                                                    value,
                                                );
                                            }}
                                        />

                                        {isGroupsEnabled && (
                                            <MultiSelect
                                                variant="subtle"
                                                label={
                                                    <Group gap="xs">
                                                        <Text fz="sm" fw={500}>
                                                            Group Access
                                                        </Text>
                                                        <Tooltip
                                                            label="Admins and developers (Manage AI Agents scope) will always have access to this agent."
                                                            withArrow
                                                            withinPortal
                                                            multiline
                                                            position="right"
                                                            maw="250px"
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    IconInfoCircle
                                                                }
                                                            />
                                                        </Tooltip>
                                                    </Group>
                                                }
                                                description="Select groups that can access this agent."
                                                placeholder={
                                                    isLoadingGroups
                                                        ? 'Loading groups...'
                                                        : groupOptions.length ===
                                                            0
                                                          ? 'No groups available'
                                                          : 'Select groups or leave empty for all users'
                                                }
                                                data={groupOptions}
                                                disabled={
                                                    isLoadingGroups ||
                                                    groupOptions.length === 0
                                                }
                                                comboboxProps={{
                                                    transitionProps: {
                                                        transition: 'pop',
                                                        duration: 200,
                                                    },
                                                }}
                                                clearable
                                                {...form.getInputProps(
                                                    'groupAccess',
                                                )}
                                                value={
                                                    form.getInputProps(
                                                        'groupAccess',
                                                    ).value ?? []
                                                }
                                                onChange={(value) => {
                                                    form.setFieldValue(
                                                        'groupAccess',
                                                        value.length > 0
                                                            ? value
                                                            : [],
                                                    );
                                                }}
                                            />
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        </AgentSettingsSubsection>
                    </AgentSettingsSection>

                    <AgentSettingsSection
                        id="integrations"
                        icon={IconPlug}
                        title="Integrations"
                        description="Where people reach this agent, and what it can reach."
                    >
                        <AgentSettingsSubsection
                            title="Slack"
                            description="Channels where people can talk to this agent."
                            action={
                                <Group
                                    c={
                                        slackChannelsConfigured
                                            ? 'green.4'
                                            : 'dimmed'
                                    }
                                    gap="xxs"
                                    align="center"
                                    wrap="nowrap"
                                >
                                    <MantineIcon
                                        icon={IconPointFilled}
                                        size={16}
                                    />
                                    <Text size="xs">
                                        {!slackInstallation?.organizationUuid
                                            ? 'Disabled'
                                            : !slackChannelsConfigured
                                              ? 'Channels not configured'
                                              : 'Enabled'}
                                    </Text>
                                </Group>
                            }
                        >
                            <LoadingOverlay
                                visible={isLoadingSlackInstallation}
                            />
                            {!slackInstallation?.organizationUuid ? (
                                <Paper variant="dotted" p="sm">
                                    <Text size="xs" c="dimmed" ta="center">
                                        To enable AI agent interactions through
                                        Slack, please connect your Slack
                                        workspace in the{' '}
                                        <Anchor
                                            c="dimmed"
                                            underline="always"
                                            href="/generalSettings/integrations"
                                            target="_blank"
                                        >
                                            Integrations settings
                                        </Anchor>
                                        . Once connected, you can select
                                        channels where this agent will be
                                        available.
                                    </Text>
                                </Paper>
                            ) : (
                                <Stack gap="xs">
                                    {slackChannelsConfigured && (
                                        <Text size="sm" c="dimmed">
                                            Tag the Slack app{' '}
                                            <Code>
                                                @{slackInstallation.appName}
                                            </Code>{' '}
                                            to get started.
                                        </Text>
                                    )}
                                    <SlackChannelSelect
                                        includeGroups
                                        multiple
                                        withRefresh
                                        size="sm"
                                        variant="subtle"
                                        label="Channels"
                                        placeholder="Search channel(s)"
                                        value={form.values.integrations.map(
                                            (i) => i.channelId,
                                        )}
                                        onChange={(value) => {
                                            form.setFieldValue(
                                                'integrations',
                                                value.map(
                                                    (v) =>
                                                        ({
                                                            type: 'slack',
                                                            channelId: v,
                                                        }) as const,
                                                ),
                                            );
                                        }}
                                    />
                                </Stack>
                            )}
                        </AgentSettingsSubsection>

                        <Divider />

                        <AiAgentMcpServersInput
                            agentUuid={agentUuid}
                            isSavingAgent={isSavingAgent}
                            onPersistedChange={handlePersistedMcpServerChange}
                            persistedMcpServerUuids={persistedMcpServerUuids}
                            projectUuid={projectUuid}
                            value={form.values.mcpServerUuids}
                            onChange={(value) => {
                                form.setFieldValue('mcpServerUuids', value);
                            }}
                        />
                    </AgentSettingsSection>

                    {mode === 'edit' && (
                        <AgentSettingsSection
                            id="danger-zone"
                            icon={IconAlertTriangle}
                            title="Danger zone"
                        >
                            <Group
                                gap="xs"
                                align="center"
                                justify="space-between"
                            >
                                <Box>
                                    <Title
                                        order={6}
                                        c="ldGray.7"
                                        size="sm"
                                        fw={500}
                                    >
                                        Delete agent
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        Removes all of its data and
                                        conversations.
                                    </Text>
                                </Box>
                                <Button
                                    variant="outline"
                                    color="red"
                                    onClick={handleDeleteClick}
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                >
                                    Delete
                                </Button>
                            </Group>
                        </AgentSettingsSection>
                    )}
                </Stack>
            </form>
            <MantineModal
                opened={deleteModalOpen}
                onClose={handleCancelDelete}
                title="Delete Agent"
                variant="delete"
                resourceType="agent"
                description="This action cannot be undone."
                onConfirm={handleDelete}
            />
            {agentUuid && (
                <AiAgentAsCodeModal
                    opened={isAsCodeModalOpen}
                    onClose={asCodeModalHandlers.close}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                />
            )}
        </>
    );
};

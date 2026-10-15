import { subject } from '@casl/ability';
import {
    FeatureFlags,
    MAX_RETENTION_WINDOW_HOURS,
    MIN_RETENTION_WINDOW_HOURS,
    type AiAgentModelConfig,
    type AiAgentUserAccessDetail,
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
import { type UseFormReturnType } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconBolt,
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
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';
import { BetaBadge } from '../../../../components/common/BetaBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    renderModelSelectOption,
    toModelSelectItem,
} from '../../../../components/common/ModelSelector/modelSelectOption';
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
import { useAiProviderCredentials } from '../hooks/useAiProviderCredentials';
import { useDeleteAiAgentMutation } from '../hooks/useProjectAiAgents';
import { useGetAgentExploreAccessSummary } from '../hooks/useUserAgentPreferences';
import { AgentSettingsSection } from './AgentSettingsSection';
import { AgentSettingsSubsection } from './AgentSettingsSubsection';
import AiAgentAsCodeModal from './AiAgentAsCodeModal';
import classes from './AiAgentFormSetup.module.css';
import { AiAgentKnowledgeFilesSection } from './AiAgentKnowledgeFilesSection';
import { AiAgentMcpServersInput } from './AiAgentMcpServersInput';
import { AiAgentSkillsSection } from './AiAgentSkillsSection';
import { DeprecatedModelNotice } from './DeprecatedModelNotice';
import { InstructionsGuidelines } from './InstructionsSupport';
import { SpaceAccessSelect } from './SpaceAccessSelect';
import { ThreadRetentionSelect } from './ThreadRetentionSelect';

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().nullable(),
    integrations: z.array(
        z.object({
            type: z.literal('slack'),
            channelId: z.string().min(1, 'Channel is required'),
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
    providerCredentialUuid: z.string().nullable(),
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
            position="right"
            maw="300px"
        >
            <ActionIcon
                type="button"
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
    userAccessDetails,
    avatarMode,
    avatarFileName,
    onAvatarFileChange,
    onAvatarModeChange,
    onAvatarRemove,
    onAvatarRevert,
}: {
    mode: 'create' | 'edit';
    form: UseFormReturnType<z.infer<typeof formSchema>>;
    projectUuid: string;
    agentUuid?: string;
    isSavingAgent?: boolean;
    onSubmit: () => void;
    persistedMcpServerUuids?: string[];
    // Names for the saved user access, so pills are labelled before the
    // org user search has loaded them.
    userAccessDetails?: AiAgentUserAccessDetail[];
    avatarMode: 'upload' | 'link';
    avatarFileName: string | null;
    onAvatarFileChange: (file: File | null) => void;
    onAvatarModeChange: (mode: 'upload' | 'link') => void;
    onAvatarRemove: () => void;
    onAvatarRevert: (() => void) | null;
}) => {
    const { t } = useTranslation('aiAgent');
    const { data: aiOrganizationSettings } = useAiOrganizationSettings();
    const modelOptions = aiOrganizationSettings?.defaultAiAgentModelOptions;
    // Shown when there is a real choice, or when a pin is already set — a
    // pinned agent must always offer a way to clear its pin, even when the
    // credential is unreadable or the viewer cannot list credentials.
    const providerCredentialsQuery = useAiProviderCredentials({ retry: false });
    const customProvidersFlagQuery = useServerFeatureFlag(
        FeatureFlags.OrgAiCustomProviders,
    );
    const pinnedCredentialUuid = form.values.providerCredentialUuid;
    const showCredentialSelector =
        pinnedCredentialUuid !== null ||
        (customProvidersFlagQuery.isSuccess &&
            customProvidersFlagQuery.data.enabled &&
            (providerCredentialsQuery.data?.credentials.length ?? 0) > 1);
    const credentialOptions = useMemo(() => {
        const options: { value: string; label: string; disabled?: boolean }[] =
            (providerCredentialsQuery.data?.credentials ?? []).map(
                (credential) => ({
                    value: credential.uuid,
                    label: t('form.credentialOption', {
                        label: credential.label,
                        region: credential.region,
                    }),
                }),
            );
        if (
            pinnedCredentialUuid &&
            !options.some((option) => option.value === pinnedCredentialUuid)
        ) {
            const unreadable =
                providerCredentialsQuery.data?.unreadableCredentials.find(
                    (credential) => credential.uuid === pinnedCredentialUuid,
                );
            options.push({
                value: pinnedCredentialUuid,
                label: unreadable
                    ? t('form.credentialUnavailableNamed', {
                          label: unreadable.label,
                      })
                    : t('form.credentialUnavailable'),
                disabled: true,
            });
        }
        return options;
    }, [providerCredentialsQuery.data, pinnedCredentialUuid, t]);
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
        modelReplacement,
        selectedModel,
        selectedModelKey,
        showReasoningDefault,
        visibleModelOptions,
    } = useDefaultAiAgentModel({
        modelOptions,
        modelConfig: form.values.modelConfig,
        fallbackModelConfig: aiOrganizationSettings?.defaultAiAgentModelConfig,
        fallbackLabel: t('form.organizationDefault'),
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
                        title={t('settingsSections.identity')}
                        description={t('form.identity.description')}
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
                                    {t('form.identity.viewAsCode')}
                                </Button>
                            ) : null
                        }
                    >
                        <TextInput
                            label={t('form.identity.name')}
                            placeholder={t('form.identity.namePlaceholder')}
                            variant="subtle"
                            // Typed anchor for scope walkthroughs, read first
                            // as a look at naming.
                            data-tour-anchor="agent-name"
                            data-tour-hint="Name the agent"
                            data-tour-input="true"
                            data-tour-suggest="Sales analyst"
                            data-tour-scope="manage:AiAgent"
                            data-tour-look="2"
                            data-tour-after='[data-tour-anchor="agent-new"]'
                            data-tour-label="A name your team will recognise"
                            data-tour-docs="agents/set-up-agents.mdx#name-and-image:1"
                            {...form.getInputProps('name')}
                        />
                        <CommitOnBlurTextarea
                            key={`description-${
                                form.values.description != null
                            }`}
                            variant="subtle"
                            label={t('form.identity.descriptionLabel')}
                            description={t('form.identity.descriptionHelp')}
                            placeholder={t(
                                'form.identity.descriptionPlaceholder',
                            )}
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
                                {t('form.identity.avatar')}
                            </Text>
                            <Text size="xs" c="dimmed" mt={2}>
                                {t('form.identity.avatarHelp')}
                            </Text>

                            {avatarMode === 'link' ? (
                                <TextInput
                                    mt="sm"
                                    variant="subtle"
                                    label={t('form.identity.avatarUrl')}
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
                                                {t('form.identity.uploadImage')}
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
                                        ? t('form.identity.uploadInstead')
                                        : t('form.identity.urlInstead')}
                                </Anchor>
                                {onAvatarRevert !== null && (
                                    <Anchor
                                        component="button"
                                        type="button"
                                        size="xs"
                                        c="dimmed"
                                        onClick={onAvatarRevert}
                                    >
                                        {t('form.identity.revert')}
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
                                        {t('actions.remove', { ns: 'common' })}
                                    </Anchor>
                                )}
                            </Group>
                        </Box>
                    </AgentSettingsSection>

                    <AgentSettingsSection
                        id="behaviour"
                        icon={IconSparkles}
                        title={t('settingsSections.behaviour')}
                        description={t('form.behaviour.description')}
                    >
                        <AgentSettingsSubsection
                            title={t('form.behaviour.instructions')}
                            description={t(
                                'form.behaviour.instructionsDescription',
                            )}
                        >
                            <CommitOnBlurTextarea
                                key={`instruction-${
                                    form.values.instruction != null
                                }`}
                                variant="subtle"
                                aria-label={t('form.behaviour.instructions')}
                                placeholder={t(
                                    'form.behaviour.instructionsPlaceholder',
                                )}
                                resize="vertical"
                                autosize
                                minRows={3}
                                maxRows={8}
                                // Typed anchor for scope walkthroughs, read first
                                // as a look at what instructions do.
                                data-tour-anchor="agent-instructions"
                                data-tour-hint="Write the instructions"
                                data-tour-input="true"
                                data-tour-suggest="You are the analyst for a jaffle shop. Answer questions about customers, orders and payments, and prefer charts over tables."
                                data-tour-scope="manage:AiAgent"
                                data-tour-look="3"
                                data-tour-after='[data-tour-anchor="agent-name"]'
                                data-tour-label="Instructions shape every answer"
                                data-tour-docs="agents/set-up-agents.mdx#instructions:1"
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
                                        {t('form.behaviour.guidelines')}
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        {t('form.behaviour.guidelinesHelp')}
                                    </Text>
                                </Box>
                                <InstructionsGuidelines />
                                <Text c="dimmed" size="xs">
                                    <Trans
                                        t={t}
                                        i18nKey="form.behaviour.docsLink"
                                        components={{
                                            anchor: (
                                                <Anchor
                                                    href="https://docs.lightdash.com/guides/ai-agents#writing-effective-instructions"
                                                    target="_blank"
                                                />
                                            ),
                                        }}
                                    />
                                </Text>
                            </Stack>
                        </AgentSettingsSubsection>

                        {user.data?.organizationUuid ? (
                            <>
                                <Divider />
                                <AiAgentSkillsSection
                                    agentUuid={agentUuid ?? null}
                                    projectUuid={projectUuid}
                                    organizationUuid={
                                        user.data.organizationUuid
                                    }
                                />
                            </>
                        ) : null}

                        <Divider />

                        <AgentSettingsSubsection
                            title={t('form.behaviour.defaultModel')}
                            description={t(
                                'form.behaviour.defaultModelDescription',
                            )}
                        >
                            <Select
                                variant="subtle"
                                aria-label={t('form.behaviour.defaultModel')}
                                value={selectedModelKey}
                                disabled={
                                    isSavingAgent || !modelOptions?.length
                                }
                                placeholder={organizationDefaultModelLabel}
                                clearable
                                data={visibleModelOptions.map(
                                    toModelSelectItem,
                                )}
                                renderOption={renderModelSelectOption}
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

                            {selectedModel?.deprecated && (
                                <DeprecatedModelNotice
                                    model={selectedModel}
                                    replacement={modelReplacement}
                                    disabled={isSavingAgent ?? false}
                                    onSwitch={(modelConfig) => {
                                        form.setFieldValue(
                                            'modelConfig',
                                            modelConfig,
                                        );
                                        onSubmit();
                                    }}
                                />
                            )}

                            {showReasoningDefault && (
                                <Switch
                                    variant="subtle"
                                    label={t('form.behaviour.highReasoning')}
                                    description={t(
                                        'form.behaviour.highReasoningDescription',
                                    )}
                                    checked={
                                        form.values.modelConfig?.reasoning ===
                                        true
                                    }
                                    disabled={isSavingAgent}
                                    onChange={(event) => {
                                        if (!selectedModel) return;
                                        form.setFieldValue('modelConfig', {
                                            ...form.values.modelConfig,
                                            modelName: selectedModel.name,
                                            modelProvider:
                                                selectedModel.provider,
                                            reasoning:
                                                event.currentTarget.checked,
                                        });
                                    }}
                                />
                            )}
                        </AgentSettingsSubsection>

                        {showCredentialSelector && (
                            <>
                                <Divider />
                                <AgentSettingsSubsection
                                    title={t('form.behaviour.credential')}
                                    description={t(
                                        'form.behaviour.credentialDescription',
                                    )}
                                >
                                    <Select
                                        variant="subtle"
                                        aria-label={t(
                                            'form.behaviour.credential',
                                        )}
                                        value={pinnedCredentialUuid}
                                        disabled={isSavingAgent}
                                        placeholder={t(
                                            'form.behaviour.credentialPlaceholder',
                                        )}
                                        clearable
                                        data={credentialOptions}
                                        onChange={(value) =>
                                            form.setFieldValue(
                                                'providerCredentialUuid',
                                                value ?? null,
                                            )
                                        }
                                    />
                                </AgentSettingsSubsection>
                            </>
                        )}
                    </AgentSettingsSection>

                    <AgentSettingsSection
                        id="knowledge-and-data"
                        icon={IconBook2}
                        title={t('settingsSections.knowledgeAndData')}
                        description={t('form.knowledge.description')}
                    >
                        <AgentSettingsSubsection
                            title={t('form.knowledge.documents')}
                            description={t(
                                'form.knowledge.documentsDescription',
                            )}
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
                                        {t(
                                            'form.knowledge.documentsAfterCreate',
                                        )}
                                    </Text>
                                </Paper>
                            )}
                        </AgentSettingsSubsection>

                        <Divider />

                        <AgentSettingsSubsection
                            title={t('form.knowledge.explores')}
                            description={
                                <>
                                    {t('form.knowledge.exploresDescription')}{' '}
                                    <Anchor
                                        fz="xs"
                                        href="https://docs.lightdash.com/guides/ai-agents#limiting-access-to-specific-explores-and-fields"
                                        target="_blank"
                                    >
                                        {t('form.learnMore')}
                                    </Anchor>
                                </>
                            }
                        >
                            <Box>
                                <TagsInput
                                    variant="subtle"
                                    aria-label={t('form.knowledge.exploreTags')}
                                    placeholder={t('form.knowledge.selectTags')}
                                    inputWrapperOrder={[
                                        'label',
                                        'input',
                                        'description',
                                    ]}
                                    description={
                                        exploreAccessSummaryQuery.isSuccess ? (
                                            exploreAccessSummaryQuery.data
                                                .length === 0 ? (
                                                t('form.knowledge.noExplores')
                                            ) : (
                                                <Trans
                                                    t={t}
                                                    i18nKey="form.knowledge.exploresAvailable"
                                                    count={
                                                        exploreAccessSummaryQuery
                                                            .data.length
                                                    }
                                                    components={{
                                                        anchor: (
                                                            <Anchor
                                                                size="xs"
                                                                onClick={
                                                                    toggleExploreAccessSummary
                                                                }
                                                            />
                                                        ),
                                                    }}
                                                />
                                            )
                                        ) : (
                                            t('form.knowledge.loadingAccess')
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
                                        expanded={isExploreAccessSummaryOpen}
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
                            title={t('form.knowledge.spaces')}
                            description={t('form.knowledge.spacesDescription')}
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
                        id="capabilities"
                        icon={IconBolt}
                        title={t('settingsSections.capabilities')}
                        description={t('form.capabilities.description')}
                    >
                        <Stack gap="md">
                            <Switch
                                variant="subtle"
                                label={
                                    <SwitchLabel
                                        text={t('form.capabilities.dataAccess')}
                                        help={t(
                                            'form.capabilities.dataAccessHelp',
                                        )}
                                        badge={null}
                                    />
                                }
                                description={
                                    <>
                                        {t(
                                            'form.capabilities.dataAccessDescription',
                                        )}{' '}
                                        <Anchor
                                            href="https://docs.lightdash.com/guides/ai-agents#data-access-control"
                                            target="_blank"
                                            size="xs"
                                            className={classes.switchLink}
                                        >
                                            {t('form.learnMore')}
                                        </Anchor>
                                    </>
                                }
                                {...form.getInputProps('enableDataAccess', {
                                    type: 'checkbox',
                                })}
                                onChange={(event) => {
                                    const enabled = event.currentTarget.checked;

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
                                        text={t('form.capabilities.content')}
                                        help={t(
                                            'form.capabilities.contentHelp',
                                        )}
                                        badge={<BetaBadge />}
                                    />
                                }
                                description={t(
                                    'form.capabilities.contentDescription',
                                )}
                                {...form.getInputProps('enableContentTools', {
                                    type: 'checkbox',
                                })}
                                disabled={!form.values.enableDataAccess}
                            />
                            <Switch
                                variant="subtle"
                                label={
                                    <SwitchLabel
                                        text={t('form.capabilities.sql')}
                                        help={t('form.capabilities.sqlHelp')}
                                        badge={null}
                                    />
                                }
                                description={
                                    <>
                                        {t('form.capabilities.sqlDescription')}{' '}
                                        <Anchor
                                            component={Link}
                                            to={`/generalSettings/projectManagement/${projectUuid}/agentDataScope`}
                                            size="xs"
                                            className={classes.switchLink}
                                        >
                                            {t(
                                                'form.capabilities.sqlConfigure',
                                            )}
                                        </Anchor>
                                    </>
                                }
                                {...form.getInputProps('enableSqlMode', {
                                    type: 'checkbox',
                                })}
                            />
                        </Stack>

                        <Text size="xs" c="dimmed">
                            <Trans
                                t={t}
                                i18nKey="form.capabilities.readAccessNote"
                                components={{
                                    anchor: (
                                        <Anchor
                                            component="button"
                                            type="button"
                                            size="xs"
                                            onClick={scrollToKnowledgeAndData}
                                        />
                                    ),
                                }}
                            />
                        </Text>
                    </AgentSettingsSection>

                    <AgentSettingsSection
                        id="access-and-privacy"
                        icon={IconLock}
                        title={t('settingsSections.accessAndPrivacy')}
                        description={t('form.access.description')}
                    >
                        <Switch
                            variant="subtle"
                            label={
                                <SwitchLabel
                                    text={t('form.access.userContext')}
                                    help={t('form.access.userContextHelp')}
                                    badge={null}
                                />
                            }
                            description={t(
                                'form.access.userContextDescription',
                            )}
                            {...form.getInputProps('enableUserContext', {
                                type: 'checkbox',
                            })}
                        />

                        {threadRetentionFlagQuery.data?.enabled && (
                            <>
                                <Divider />
                                <AgentSettingsSubsection
                                    title={t('form.access.threadRetention')}
                                    description={
                                        aiOrganizationSettings?.threadRetentionHours !=
                                        null
                                            ? t(
                                                  'form.access.threadRetentionDescriptionCapped',
                                              )
                                            : t(
                                                  'form.access.threadRetentionDescription',
                                              )
                                    }
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

                        <AgentSettingsSubsection
                            title={t('form.access.whoCanUse')}
                        >
                            <Stack gap="md">
                                <Radio.Group
                                    value={accessMode}
                                    onChange={handleAccessModeChange}
                                >
                                    <Stack gap="sm">
                                        <Radio
                                            value="everyone"
                                            label={t('form.access.everyone')}
                                            description={t(
                                                'form.access.everyoneDescription',
                                            )}
                                        />
                                        <Radio
                                            value="admins"
                                            label={t('form.access.adminsOnly')}
                                            description={t(
                                                'form.access.adminsOnlyDescription',
                                            )}
                                        />
                                        <Radio
                                            value="specific"
                                            label={
                                                isGroupsEnabled
                                                    ? t(
                                                          'form.access.specificUsersAndGroups',
                                                      )
                                                    : t(
                                                          'form.access.specificUsers',
                                                      )
                                            }
                                            description={
                                                isGroupsEnabled
                                                    ? t(
                                                          'form.access.specificUsersAndGroupsDescription',
                                                      )
                                                    : t(
                                                          'form.access.specificUsersDescription',
                                                      )
                                            }
                                        />
                                    </Stack>
                                </Radio.Group>

                                {accessMode === 'specific' && (
                                    <Stack pl="xl">
                                        <UserAccessMultiSelect
                                            projectUuid={projectUuid!}
                                            isGroupsEnabled={isGroupsEnabled}
                                            selectedUserDetails={
                                                userAccessDetails
                                            }
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
                                                            {t(
                                                                'form.access.groupAccess',
                                                            )}
                                                        </Text>
                                                        <Tooltip
                                                            label={t(
                                                                'form.access.groupAccessTooltip',
                                                            )}
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
                                                description={t(
                                                    'form.access.groupAccessDescription',
                                                )}
                                                placeholder={
                                                    isLoadingGroups
                                                        ? t(
                                                              'form.access.loadingGroups',
                                                          )
                                                        : groupOptions.length ===
                                                            0
                                                          ? t(
                                                                'form.access.noGroups',
                                                            )
                                                          : t(
                                                                'form.access.selectGroups',
                                                            )
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
                        id="connections"
                        icon={IconPlug}
                        title={t('settingsSections.connections')}
                        description={t('form.connections.description')}
                    >
                        <AgentSettingsSubsection
                            title={t('form.connections.slack')}
                            description={t('form.connections.slackDescription')}
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
                                            ? t('form.connections.disabled')
                                            : !slackChannelsConfigured
                                              ? t(
                                                    'form.connections.channelsNotConfigured',
                                                )
                                              : t('form.connections.enabled')}
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
                                        <Trans
                                            t={t}
                                            i18nKey="form.connections.slackNotConnected"
                                            components={{
                                                anchor: (
                                                    <Anchor
                                                        c="dimmed"
                                                        underline="always"
                                                        href="/generalSettings/integrations"
                                                        target="_blank"
                                                    />
                                                ),
                                            }}
                                        />
                                    </Text>
                                </Paper>
                            ) : (
                                <Stack gap="xs">
                                    {slackChannelsConfigured && (
                                        <Text size="sm" c="dimmed">
                                            <Trans
                                                t={t}
                                                i18nKey="form.connections.tagSlackApp"
                                                values={{
                                                    appName:
                                                        slackInstallation.appName,
                                                }}
                                                components={{ code: <Code /> }}
                                            />
                                        </Text>
                                    )}
                                    <SlackChannelSelect
                                        includeGroups
                                        multiple
                                        withRefresh
                                        size="sm"
                                        variant="subtle"
                                        label={t('form.connections.channels')}
                                        placeholder={t(
                                            'form.connections.searchChannels',
                                        )}
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
                            title={t('settingsSections.dangerZone')}
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
                                        {t('form.danger.deleteAgent')}
                                    </Title>
                                    <Text c="dimmed" size="xs">
                                        {t(
                                            'form.danger.deleteAgentDescription',
                                        )}
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
                                    {t('actions.delete', { ns: 'common' })}
                                </Button>
                            </Group>
                        </AgentSettingsSection>
                    )}
                </Stack>
            </form>
            <MantineModal
                opened={deleteModalOpen}
                onClose={handleCancelDelete}
                title={t('form.danger.deleteModalTitle')}
                variant="delete"
                resourceType={t('form.danger.resourceType')}
                description={t('form.danger.cannotBeUndone')}
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

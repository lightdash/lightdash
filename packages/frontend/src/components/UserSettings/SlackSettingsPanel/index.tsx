import {
    CommercialFeatureFlags,
    type SlackAppCustomSettings,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Avatar,
    Badge,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconDeviceFloppy,
    IconHelpCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';
import { useAiAgentAdminAgents } from '../../../ee/features/aiCopilot/hooks/useAiAgentAdmin';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import {
    useDeleteSlack,
    useGetSlack,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../hooks/slack/useSlack';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import slackSvg from '../../../svgs/slack.svg';
import Callout from '../../common/Callout';
import { default as MantineIcon } from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import { SlackChannelSelect } from '../../common/SlackChannelSelect';
import { ProjectSelect } from './ProjectSelect';
import { SlackMissingScopesAlert } from './SlackMissingScopesAlert';
import { SlackSettingRow } from './SlackSettingRow';

const SLACK_INSTALL_URL = `/api/v1/slack/install/`;

type SlackSettingsFormValues = SlackAppCustomSettings & {
    requireExplicitSlackChannelLinking: boolean;
};

const getFormSchema = (t: TFunction<'userSettings'>) =>
    z.object({
        notificationChannel: z
            .string()
            .min(1, t('slackSettingsPanel.validation.channelRequired'))
            .nullable(),
        appProfilePhotoUrl: z
            .string()
            .url({ message: t('slackSettingsPanel.validation.invalidUrl') })
            .max(2048, {
                message: t('slackSettingsPanel.validation.urlTooLong'),
            })
            .nullable(),
        slackChannelProjectMappings: z.array(
            z.object({
                projectUuid: z
                    .string({
                        message: t(
                            'slackSettingsPanel.validation.projectRequired',
                        ),
                    })
                    .uuid({
                        message: t(
                            'slackSettingsPanel.validation.invalidProject',
                        ),
                    }),
                slackChannelId: z
                    .string({
                        message: t(
                            'slackSettingsPanel.validation.slackChannelRequired',
                        ),
                    })
                    .min(
                        1,
                        t('slackSettingsPanel.validation.slackChannelRequired'),
                    ),
                availableTags: z
                    .array(
                        z
                            .string()
                            .min(
                                1,
                                t('slackSettingsPanel.validation.tagEmpty'),
                            ),
                    )
                    .nullable(),
            }),
        ),
        aiThreadAccessConsent: z.boolean().optional(),
        aiRequireOAuth: z.boolean().optional(),
        aiLinksOnly: z.boolean().optional(),
        aiMultiAgentChannelId: z
            .string()
            .min(1, t('slackSettingsPanel.validation.channelRequired'))
            .optional(),
        aiMultiAgentProjectUuids: z
            .array(z.string().uuid())
            .nullable()
            .optional(),
        unfurlsEnabled: z.boolean().optional(),
        aiAgentsEnabled: z.boolean().optional(),
        requireExplicitSlackChannelLinking: z.boolean(),
    });

const SlackSettingsPanel: FC = () => {
    const { t } = useTranslation('userSettings');
    const aiOrganizationSettingsQuery = useAiOrganizationAdminSettings();
    const { data: aiCopilotFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );
    const { data: slackInstallation, isInitialLoading } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;
    const isAiCopilotEnabledOrTrial =
        !!aiCopilotFlag?.enabled ||
        !!aiOrganizationSettingsQuery.data?.isCopilotEnabled ||
        !!aiOrganizationSettingsQuery.data?.isTrial;

    const { mutate: deleteSlack } = useDeleteSlack();
    const { mutate: updateCustomSettings, isLoading: isUpdatingSlackSettings } =
        useUpdateSlackAppCustomSettingsMutation();
    const {
        mutate: updateAiOrganizationSettings,
        isLoading: isUpdatingAiOrganizationSettings,
    } = useUpdateAiOrganizationSettings();

    const { data: aiAgents } = useAiAgentAdminAgents({
        enabled: organizationHasSlack && isAiCopilotEnabledOrTrial,
    });

    const form = useForm<SlackSettingsFormValues>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
            slackChannelProjectMappings: [],
            aiThreadAccessConsent: false,
            aiRequireOAuth: false,
            aiLinksOnly: false,
            aiMultiAgentChannelId: undefined,
            aiMultiAgentProjectUuids: null,
            unfurlsEnabled: true,
            aiAgentsEnabled: true,
            requireExplicitSlackChannelLinking: false,
        },
        validate: zodResolver(getFormSchema(t)),
    });

    const { setFieldValue, onSubmit } = form;

    useEffect(() => {
        if (!slackInstallation) return;

        const initialValues = {
            notificationChannel: slackInstallation.notificationChannel ?? null,
            appProfilePhotoUrl: slackInstallation.appProfilePhotoUrl ?? null,
            slackChannelProjectMappings:
                slackInstallation.slackChannelProjectMappings ?? [],
            aiThreadAccessConsent:
                slackInstallation.aiThreadAccessConsent ?? false,
            aiRequireOAuth: slackInstallation.aiRequireOAuth ?? false,
            aiLinksOnly: slackInstallation.aiLinksOnly ?? false,
            aiMultiAgentChannelId:
                slackInstallation.aiMultiAgentChannelId ?? undefined,
            aiMultiAgentProjectUuids:
                slackInstallation.aiMultiAgentProjectUuids ?? null,
            unfurlsEnabled: slackInstallation.unfurlsEnabled ?? true,
            aiAgentsEnabled: slackInstallation.aiAgentsEnabled ?? true,
            requireExplicitSlackChannelLinking:
                aiOrganizationSettingsQuery.data
                    ?.requireExplicitSlackChannelLinking ?? false,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackInstallation, aiOrganizationSettingsQuery.data]);

    const aiAgentsDisabled = !(form.values.aiAgentsEnabled ?? true);

    const conflictingAgents = useMemo(() => {
        const channelId = form.values.aiMultiAgentChannelId;
        if (!channelId || !aiAgents) return [];
        return aiAgents.filter((agent) =>
            agent.integrations.some(
                (integration) =>
                    integration.type === 'slack' &&
                    integration.channelId === channelId,
            ),
        );
    }, [form.values.aiMultiAgentChannelId, aiAgents]);

    if (
        isInitialLoading ||
        aiOrganizationSettingsQuery.isInitialLoading ||
        (organizationHasSlack && !form.initialized)
    ) {
        return <Loader />;
    }

    const handleSubmit = onSubmit((args) => {
        if (organizationHasSlack) {
            const { requireExplicitSlackChannelLinking, ...slackSettings } =
                args;

            updateCustomSettings(slackSettings);

            if (
                requireExplicitSlackChannelLinking !==
                (aiOrganizationSettingsQuery.data
                    ?.requireExplicitSlackChannelLinking ?? false)
            ) {
                updateAiOrganizationSettings({
                    requireExplicitSlackChannelLinking,
                });
            }
        }
    });

    return (
        <SettingsGridCard>
            <Stack gap="sm">
                <Box>
                    <Group gap="sm">
                        <Avatar src={slackSvg} size="md" />
                        <Title order={5}>Slack</Title>
                    </Group>
                </Box>
            </Stack>

            <Stack>
                <Stack gap="sm">
                    {organizationHasSlack && (
                        <Group gap="xs">
                            <Text fw={500}>
                                {t('slackSettingsPanel.addedToWorkspace')}
                            </Text>{' '}
                            <Badge
                                radius="xs"
                                size="lg"
                                color="green"
                                w="fit-content"
                            >
                                <Text span fw={500}>
                                    {slackInstallation.slackTeamName}
                                </Text>
                            </Badge>
                        </Group>
                    )}

                    <Text c="dimmed" fz="xs">
                        {t('slackSettingsPanel.description')}{' '}
                        <Anchor href="https://docs.lightdash.com/references/slack-integration">
                            {t('slackSettingsPanel.viewDocs')}
                        </Anchor>
                    </Text>
                </Stack>

                {organizationHasSlack ? (
                    <form onSubmit={handleSubmit}>
                        <Stack gap="sm">
                            <SlackChannelSelect
                                label={
                                    <Group gap="two" mb={2}>
                                        <Text>
                                            {t(
                                                'slackSettingsPanel.notificationChannel.label',
                                            )}
                                        </Text>
                                        <Tooltip
                                            maw={250}
                                            label={t(
                                                'slackSettingsPanel.notificationChannel.tooltip',
                                            )}
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                            />
                                        </Tooltip>
                                    </Group>
                                }
                                value={form.values.notificationChannel}
                                onChange={(value) => {
                                    setFieldValue(
                                        'notificationChannel',
                                        value ?? null,
                                    );
                                }}
                                placeholder={t(
                                    'slackSettingsPanel.notificationChannel.placeholder',
                                )}
                            />
                            <Title order={6} fw={500}>
                                {t('slackSettingsPanel.botAvatar.title')}
                            </Title>
                            <Group gap="sm">
                                <Avatar
                                    size="lg"
                                    src={form.values?.appProfilePhotoUrl}
                                    radius="md"
                                    bg="ldGray.1"
                                />
                                <TextInput
                                    flex={1}
                                    label={t(
                                        'slackSettingsPanel.botAvatar.profilePhotoUrl',
                                    )}
                                    size="xs"
                                    placeholder="https://lightdash.cloud/photo.jpg"
                                    type="url"
                                    disabled={!organizationHasSlack}
                                    {...form.getInputProps(
                                        'appProfilePhotoUrl',
                                    )}
                                    value={
                                        form.values.appProfilePhotoUrl ??
                                        undefined
                                    }
                                />
                            </Group>
                            <Stack gap="sm" mt="sm">
                                <Title order={5}>
                                    {t(
                                        'slackSettingsPanel.configuration.title',
                                    )}
                                </Title>
                                <Stack gap={0}>
                                    <SlackSettingRow
                                        title={t(
                                            'slackSettingsPanel.configuration.linkPreviews.title',
                                        )}
                                        description={t(
                                            'slackSettingsPanel.configuration.linkPreviews.description',
                                        )}
                                        checked={
                                            form.values.unfurlsEnabled ?? true
                                        }
                                        onChange={(checked) =>
                                            setFieldValue(
                                                'unfurlsEnabled',
                                                checked,
                                            )
                                        }
                                    />
                                    {isAiCopilotEnabledOrTrial && (
                                        <>
                                            <SlackSettingRow
                                                title={t(
                                                    'slackSettingsPanel.configuration.aiAgents.title',
                                                )}
                                                description={t(
                                                    'slackSettingsPanel.configuration.aiAgents.description',
                                                )}
                                                checked={
                                                    form.values
                                                        .aiAgentsEnabled ?? true
                                                }
                                                onChange={(checked) =>
                                                    setFieldValue(
                                                        'aiAgentsEnabled',
                                                        checked,
                                                    )
                                                }
                                            />
                                            <SlackSettingRow
                                                title={t(
                                                    'slackSettingsPanel.configuration.threadAccessConsent.title',
                                                )}
                                                description={t(
                                                    'slackSettingsPanel.configuration.threadAccessConsent.description',
                                                )}
                                                disabled={aiAgentsDisabled}
                                                checked={
                                                    form.values
                                                        .aiThreadAccessConsent ??
                                                    false
                                                }
                                                onChange={(checked) =>
                                                    setFieldValue(
                                                        'aiThreadAccessConsent',
                                                        checked,
                                                    )
                                                }
                                            />
                                            <SlackSettingRow
                                                title={t(
                                                    'slackSettingsPanel.configuration.oauthRequirement.title',
                                                )}
                                                description={t(
                                                    'slackSettingsPanel.configuration.oauthRequirement.description',
                                                )}
                                                disabled={aiAgentsDisabled}
                                                checked={
                                                    form.values
                                                        .aiRequireOAuth ?? false
                                                }
                                                onChange={(checked) =>
                                                    setFieldValue(
                                                        'aiRequireOAuth',
                                                        checked,
                                                    )
                                                }
                                            />
                                            <SlackSettingRow
                                                title={t(
                                                    'slackSettingsPanel.configuration.linksOnly.title',
                                                )}
                                                description={t(
                                                    'slackSettingsPanel.configuration.linksOnly.description',
                                                )}
                                                disabled={aiAgentsDisabled}
                                                checked={
                                                    form.values.aiLinksOnly ??
                                                    false
                                                }
                                                onChange={(checked) =>
                                                    setFieldValue(
                                                        'aiLinksOnly',
                                                        checked,
                                                    )
                                                }
                                            />
                                            <SlackSettingRow
                                                title={t(
                                                    'slackSettingsPanel.configuration.automaticChannelLinking.title',
                                                )}
                                                description={t(
                                                    'slackSettingsPanel.configuration.automaticChannelLinking.description',
                                                )}
                                                disabled={
                                                    aiAgentsDisabled ||
                                                    isUpdatingAiOrganizationSettings
                                                }
                                                checked={
                                                    !form.values
                                                        .requireExplicitSlackChannelLinking
                                                }
                                                onChange={(checked) =>
                                                    setFieldValue(
                                                        'requireExplicitSlackChannelLinking',
                                                        !checked,
                                                    )
                                                }
                                            />
                                        </>
                                    )}
                                </Stack>

                                {isAiCopilotEnabledOrTrial && (
                                    <Stack gap="xs">
                                        <Group gap="xs">
                                            <Title order={6} fw={500}>
                                                {t(
                                                    'slackSettingsPanel.multiAgentChannel.title',
                                                )}
                                            </Title>

                                            <Tooltip
                                                maw={250}
                                                label={t(
                                                    'slackSettingsPanel.multiAgentChannel.tooltip',
                                                )}
                                            >
                                                <MantineIcon
                                                    icon={IconHelpCircle}
                                                />
                                            </Tooltip>
                                        </Group>

                                        <Text c="dimmed" fz="xs">
                                            {t(
                                                'slackSettingsPanel.multiAgentChannel.description',
                                            )}
                                        </Text>

                                        <SlackChannelSelect
                                            includeGroups
                                            disabled={aiAgentsDisabled}
                                            value={
                                                form.values
                                                    .aiMultiAgentChannelId ??
                                                null
                                            }
                                            onChange={(value) => {
                                                setFieldValue(
                                                    'aiMultiAgentChannelId',
                                                    value ?? undefined,
                                                );
                                            }}
                                            placeholder={t(
                                                'slackSettingsPanel.multiAgentChannel.placeholder',
                                            )}
                                        />

                                        {conflictingAgents.length > 0 && (
                                            <Callout
                                                variant="warning"
                                                title={t(
                                                    'slackSettingsPanel.multiAgentChannel.conflictTitle',
                                                )}
                                            >
                                                <Text fz="xs">
                                                    {t(
                                                        'slackSettingsPanel.multiAgentChannel.conflictDescription',
                                                        {
                                                            count: conflictingAgents.length,
                                                        },
                                                    )}
                                                </Text>
                                                <Stack gap={2} mt="xs">
                                                    {conflictingAgents.map(
                                                        (agent) => (
                                                            <Anchor
                                                                key={agent.uuid}
                                                                component={Link}
                                                                to={`/projects/${agent.projectUuid}/ai-agents/${agent.uuid}/edit`}
                                                                fz="xs"
                                                            >
                                                                {agent.name}
                                                            </Anchor>
                                                        ),
                                                    )}
                                                </Stack>
                                            </Callout>
                                        )}

                                        {form.values.aiMultiAgentChannelId && (
                                            <Stack gap="xs">
                                                <Switch
                                                    label={t(
                                                        'slackSettingsPanel.multiAgentChannel.allowAllProjects',
                                                    )}
                                                    disabled={aiAgentsDisabled}
                                                    checked={
                                                        form.values
                                                            .aiMultiAgentProjectUuids ===
                                                        null
                                                    }
                                                    onChange={(event) => {
                                                        setFieldValue(
                                                            'aiMultiAgentProjectUuids',
                                                            event.currentTarget
                                                                .checked
                                                                ? null
                                                                : [],
                                                        );
                                                    }}
                                                />

                                                {form.values
                                                    .aiMultiAgentProjectUuids !==
                                                    null && (
                                                    <ProjectSelect
                                                        disabled={
                                                            aiAgentsDisabled
                                                        }
                                                        value={
                                                            form.values
                                                                .aiMultiAgentProjectUuids ??
                                                            []
                                                        }
                                                        onChange={(value) => {
                                                            setFieldValue(
                                                                'aiMultiAgentProjectUuids',
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
                                )}
                            </Stack>
                        </Stack>
                        <Stack align="end" mt="xl">
                            <Group gap="sm">
                                <Group gap="xs">
                                    <ActionIcon
                                        variant="default"
                                        size="md"
                                        onClick={() => deleteSlack(undefined)}
                                    >
                                        <MantineIcon
                                            icon={IconTrash}
                                            color="red"
                                        />
                                    </ActionIcon>
                                    <Button
                                        size="xs"
                                        component="a"
                                        target="_blank"
                                        variant="default"
                                        href={SLACK_INSTALL_URL}
                                        leftSection={
                                            <MantineIcon icon={IconRefresh} />
                                        }
                                    >
                                        {t('slackSettingsPanel.reinstall')}
                                    </Button>
                                </Group>
                                <Button
                                    size="xs"
                                    type="submit"
                                    loading={
                                        isUpdatingSlackSettings ||
                                        isUpdatingAiOrganizationSettings
                                    }
                                    leftSection={
                                        <MantineIcon icon={IconDeviceFloppy} />
                                    }
                                >
                                    {t('actions.save', { ns: 'common' })}
                                </Button>
                            </Group>

                            {organizationHasSlack && (
                                <SlackMissingScopesAlert
                                    features={slackInstallation.features}
                                />
                            )}
                        </Stack>
                    </form>
                ) : (
                    <Flex justify="end">
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            href={SLACK_INSTALL_URL}
                        >
                            {t('slackSettingsPanel.addToSlack')}
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default SlackSettingsPanel;

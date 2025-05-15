import { type SlackAppCustomSettings } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    useGetSlack,
    useSlackChannels,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../../hooks/slack/useSlack';
import { useProjects } from '../../../../hooks/useProjects';
import ChannelProjectMappings from './ChannelProjectMappings';

const formSchema = z.object({
    notificationChannel: z.string().min(1).nullable(),
    appProfilePhotoUrl: z.string().url().nullable(),
    slackChannelProjectMappings: z.array(
        z.object({
            projectUuid: z
                .string({ message: 'You must select a project' })
                .uuid({ message: 'Invalid project' }),
            slackChannelId: z
                .string({
                    message: 'You must select a Slack channel',
                })
                .min(1),
            availableTags: z.array(z.string().min(1)).nullable(),
        }),
    ),
});

export const AiAgents: FC = () => {
    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const { data: slackChannels } = useSlackChannels('', true, {
        enabled: organizationHasSlack,
    });

    const { mutateAsync: updateCustomSettings, isLoading: isSubmitting } =
        useUpdateSlackAppCustomSettingsMutation();

    const form = useForm<SlackAppCustomSettings>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
            slackChannelProjectMappings: [],
        },
        validate: zodResolver(formSchema),
    });

    useEffect(() => {
        if (!slackInstallation) return;

        const initialValues = {
            notificationChannel: slackInstallation.notificationChannel ?? null,
            appProfilePhotoUrl: slackInstallation.appProfilePhotoUrl ?? null,
            slackChannelProjectMappings:
                slackInstallation.slackChannelProjectMappings ?? [],
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackInstallation]);

    const slackChannelOptions = useMemo(() => {
        return (
            slackChannels?.map((channel) => ({
                value: channel.id,
                label: channel.name,
            })) ?? []
        );
    }, [slackChannels]);

    const { data: projects } = useProjects();

    const projectOptions = useMemo(() => {
        return (
            projects?.map((project) => ({
                value: project.projectUuid,
                label: project.name,
            })) ?? []
        );
    }, [projects]);

    const { refresh: refreshChannels, isLoading: isRefreshing } =
        useSlackChannels('');

    const handleSubmit = form.onSubmit(async (args) => {
        if (organizationHasSlack) {
            await updateCustomSettings(args);
        }
    });
    const handleAdd = useCallback(
        () =>
            form.insertListItem('slackChannelProjectMappings', {
                projectUuid: null,
                slackChannelId: null,
                availableTags: null,
            }),
        [form],
    );

    if (!organizationHasSlack) {
        return (
            <Stack spacing="md">
                <Box>
                    <Title order={5}>AI Agent Configuration</Title>
                    <Text size="sm" color="dimmed">
                        You need to connect Slack first in the Integrations
                        settings before you can configure AI agents.
                    </Text>
                </Box>
            </Stack>
        );
    }

    return (
        <form onSubmit={handleSubmit}>
            <Stack>
                <Stack spacing="xs">
                    <Group position="apart">
                        <Group spacing="xs">
                            <Title order={5}>
                                Slack Channel Project Mappings
                            </Title>

                            <Tooltip
                                variant="xs"
                                multiline
                                maw={250}
                                label={
                                    <Text fw={500}>
                                        Refresh Slack channel list.
                                        <Text c="gray.4" fw={400}>
                                            To see private channels, ensure the
                                            bot has been invited to them.
                                            Archived channels are not included.
                                        </Text>
                                    </Text>
                                }
                            >
                                <ActionIcon
                                    loading={isRefreshing}
                                    onClick={refreshChannels}
                                >
                                    <MantineIcon icon={IconRefresh} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        <Box align="end">
                            <Button
                                variant="default"
                                disabled={!form.isValid()}
                                onClick={handleAdd}
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                size="xs"
                            >
                                Add
                            </Button>
                        </Box>
                    </Group>
                    <Text size="xs" color="dimmed">
                        Map which project is associated with which Slack
                        channel. When a user asks a question in a channel,
                        Lightdash will look for the answer in the associated
                        project.
                    </Text>
                </Stack>

                <ChannelProjectMappings
                    form={form}
                    channelOptions={slackChannelOptions}
                    projectOptions={projectOptions}
                />

                {form.isDirty() && (
                    <Box align="end">
                        <Button type="submit" loading={isSubmitting}>
                            Save changes
                        </Button>
                    </Box>
                )}
            </Stack>
        </form>
    );
};

import {
    type AiAgentSummary,
    type ApiError,
    type CreateEmbedJwt,
    type EmbedJwtContentAiAgent,
    type EmbedUrl,
    type IntrinsicUserAttributes,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Input,
    Paper,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useMantineColorScheme } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconEye, IconLink, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useCallback, type FC, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { lightdashApi } from '../../../../api';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useAsyncClipboard } from '../../../../hooks/useAsyncClipboard';
import useUser from '../../../../hooks/user/useUser';
import EmbedCodeSnippet from './EmbedCodeSnippet';

const useEmbedUrlCreateMutation = (projectUuid: string) => {
    const { showToastError } = useToaster();
    return useMutation<EmbedUrl, ApiError, CreateEmbedJwt>(
        (data: CreateEmbedJwt) =>
            lightdashApi<EmbedUrl>({
                url: `/embed/${projectUuid}/get-embed-url`,
                method: 'POST',
                body: JSON.stringify(data),
            }),
        {
            mutationKey: ['create-embed-url'],
            onError: (error) => {
                showToastError({
                    title: `We couldn't create your embed url.`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

type FormValues = {
    agentUuid: string | undefined;
    expiresIn: string;
    userAttributes: Array<{
        uuid: string;
        key: string;
        value: string;
    }>;
    externalId?: string;
} & IntrinsicUserAttributes;

const EmbedPreviewAiAgentForm: FC<{
    projectUuid: string;
    siteUrl: string;
    agents: AiAgentSummary[];
    writeActions?: CreateEmbedJwt['writeActions'];
    writeActionsPanel?: ReactNode;
}> = ({ projectUuid, siteUrl, agents, writeActions, writeActionsPanel }) => {
    const { showToastError } = useToaster();
    const { mutateAsync: createEmbedUrl } =
        useEmbedUrlCreateMutation(projectUuid);
    const { colorScheme } = useMantineColorScheme();
    const { data: user } = useUser(true);

    const form = useForm<FormValues>({
        initialValues: {
            agentUuid: undefined,
            expiresIn: '1 hour',
            userAttributes: [{ uuid: uuidv4(), key: '', value: '' }] as Array<{
                uuid: string;
                key: string;
                value: string;
            }>,
            email: user?.email,
        },
        validate: {
            agentUuid: (value: undefined | string) => {
                return value && value.length > 0
                    ? null
                    : 'AI agent is required';
            },
        },
    });
    const { onSubmit, values: formValues } = form;
    const hasRequiredWriteActions =
        !!writeActions?.serviceAccountUserUuid && !!writeActions.spaceUuid;

    const convertFormValuesToCreateEmbedJwt = useCallback(
        (
            values: FormValues,
        ): Omit<CreateEmbedJwt, 'content'> & {
            content: EmbedJwtContentAiAgent;
        } => {
            return {
                expiresIn: values.expiresIn,
                content: {
                    type: 'aiAgent',
                    projectUuid,
                    agentUuid: values.agentUuid!,
                },
                writeActions,
                userAttributes: values.userAttributes.reduce<
                    Record<string, string>
                >((acc, item) => {
                    const key = item.key.trim();
                    if (!key) {
                        return acc;
                    }

                    return {
                        ...acc,
                        [key]: item.value,
                    };
                }, {}),
                user: {
                    externalId: values.externalId,
                    email: values.email,
                },
            };
        },
        [projectUuid, writeActions],
    );

    const validateWriteActions = useCallback(() => {
        if (hasRequiredWriteActions) {
            return true;
        }

        showToastError({
            title: 'Service account required',
            subtitle:
                'Select a service account and target space before generating an AI agent embed.',
        });
        return false;
    }, [hasRequiredWriteActions, showToastError]);

    const handlePreview = useCallback(async () => {
        const state = form.validate();
        if (state.hasErrors || !validateWriteActions()) {
            return;
        }

        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(formValues),
        );
        const previewUrl = new URL(data.url);
        previewUrl.searchParams.set('theme', colorScheme);
        window.open(previewUrl.toString(), '_blank');
    }, [
        colorScheme,
        convertFormValuesToCreateEmbedJwt,
        createEmbedUrl,
        form,
        formValues,
        validateWriteActions,
    ]);

    const generateUrl = useCallback(async () => {
        if (!validateWriteActions()) {
            return undefined;
        }

        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(form.values),
        );
        const url = new URL(data.url);
        url.searchParams.set('theme', colorScheme);
        return url.toString();
    }, [
        colorScheme,
        convertFormValuesToCreateEmbedJwt,
        createEmbedUrl,
        form.values,
        validateWriteActions,
    ]);

    const { handleCopy } = useAsyncClipboard(generateUrl);
    const handleCopySubmit = onSubmit(handleCopy);

    return (
        <form id="generate-embed-url-ai-agent" onSubmit={handleCopySubmit}>
            <Stack gap="md" mb="md">
                <Select
                    required
                    label="AI agent"
                    data={agents.map((agent) => ({
                        value: agent.uuid,
                        label: agent.name,
                    }))}
                    placeholder={
                        agents.length === 0
                            ? 'No AI agents available to embed'
                            : 'Select an AI agent...'
                    }
                    disabled={agents.length === 0}
                    searchable
                    {...form.getInputProps('agentUuid')}
                />

                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        Expires in
                    </Text>
                    <SegmentedControl
                        value={form.values.expiresIn}
                        onChange={(value) =>
                            form.setFieldValue('expiresIn', value)
                        }
                        radius="md"
                        data={[
                            { label: '1 hour', value: '1 hour' },
                            { label: '1 day', value: '1 day' },
                            { label: '1 week', value: '1 week' },
                            { label: '30 days', value: '30 days' },
                            { label: '1 year', value: '1 year' },
                        ]}
                        size="xs"
                    />
                </Stack>

                <Paper p="md" withBorder>
                    <Stack gap="md">
                        <Title order={6}>Identification & Security</Title>
                        <Stack gap="xs">
                            <Input.Wrapper label="User identifier">
                                <TextInput
                                    size="xs"
                                    placeholder="1234"
                                    {...form.getInputProps('externalId')}
                                />
                            </Input.Wrapper>

                            <Input.Wrapper label="User email">
                                <TextInput
                                    size="xs"
                                    placeholder="Type an email to add as intrinsic user attribute"
                                    {...form.getInputProps('email')}
                                />
                            </Input.Wrapper>

                            <Input.Wrapper label="User attributes">
                                <Stack gap="xs" mt="xs">
                                    {form.values.userAttributes.map(
                                        (item, index) => (
                                            <Group
                                                key={item.uuid}
                                                gap="xs"
                                                wrap="nowrap"
                                            >
                                                <TextInput
                                                    size="xs"
                                                    placeholder="E.g. user_country"
                                                    flex={1}
                                                    {...form.getInputProps(
                                                        `userAttributes.${index}.key`,
                                                    )}
                                                />
                                                <TextInput
                                                    size="xs"
                                                    placeholder="E.g. US"
                                                    flex={1}
                                                    {...form.getInputProps(
                                                        `userAttributes.${index}.value`,
                                                    )}
                                                />
                                                <ActionIcon
                                                    variant="light"
                                                    color="red"
                                                    onClick={() =>
                                                        form.removeListItem(
                                                            'userAttributes',
                                                            index,
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                </ActionIcon>
                                            </Group>
                                        ),
                                    )}
                                    <Button
                                        size="xs"
                                        variant="default"
                                        leftSection={
                                            <MantineIcon icon={IconPlus} />
                                        }
                                        onClick={() =>
                                            form.insertListItem(
                                                'userAttributes',
                                                {
                                                    key: '',
                                                    value: '',
                                                    uuid: uuidv4(),
                                                },
                                            )
                                        }
                                    >
                                        Add attribute
                                    </Button>
                                </Stack>
                            </Input.Wrapper>
                        </Stack>
                    </Stack>
                </Paper>

                {writeActionsPanel}

                <Flex justify="flex-end" gap="sm">
                    <Button
                        variant="light"
                        leftSection={<MantineIcon icon={IconEye} />}
                        onClick={handlePreview}
                        disabled={!hasRequiredWriteActions}
                    >
                        Preview
                    </Button>
                    <Button
                        variant="default"
                        type="submit"
                        leftSection={<MantineIcon icon={IconLink} />}
                        disabled={!hasRequiredWriteActions}
                    >
                        Generate & copy URL
                    </Button>
                </Flex>
            </Stack>

            <Stack gap="md" mb="md">
                <Stack gap="xs">
                    <Title order={5}>Iframe embed code</Title>
                    <Text c="dimmed" fz="sm">
                        Use this for iframe or direct embedding with a full
                        embed URL.
                    </Text>
                </Stack>
                <EmbedCodeSnippet
                    mode="iframe"
                    projectUuid={projectUuid}
                    siteUrl={siteUrl}
                    data={convertFormValuesToCreateEmbedJwt(formValues)}
                />
            </Stack>
        </form>
    );
};

export default EmbedPreviewAiAgentForm;

import {
    type ApiError,
    type CreateEmbedJwt,
    type EmbedJwtContentChart,
    type EmbedUrl,
    type IntrinsicUserAttributes,
    type SavedChart,
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
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconEye, IconLink, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useCallback, type FC } from 'react';
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
    chartUuid: string | undefined;
    expiresIn: string;
    userAttributes: Array<{
        uuid: string;
        key: string;
        value: string;
    }>;
    canExportCsv?: boolean;
    canExportImages?: boolean;
    externalId?: string;
    canExplore?: boolean;
    canViewUnderlyingData?: boolean;
} & IntrinsicUserAttributes;

const EmbedPreviewChartForm: FC<{
    projectUuid: string;
    siteUrl: string;
    charts: Pick<SavedChart, 'uuid' | 'name'>[];
}> = ({ projectUuid, siteUrl, charts }) => {
    const { mutateAsync: createEmbedUrl } =
        useEmbedUrlCreateMutation(projectUuid);
    const { data: user } = useUser(true);

    const form = useForm<FormValues>({
        initialValues: {
            chartUuid: undefined,
            expiresIn: '1 hour',
            userAttributes: [{ uuid: uuidv4(), key: '', value: '' }] as Array<{
                uuid: string;
                key: string;
                value: string;
            }>,
            email: user?.email,
            canExportCsv: false,
            canExportImages: false,
            canExplore: false,
            canViewUnderlyingData: false,
        },
        validate: {
            chartUuid: (value: undefined | string) => {
                return value && value.length > 0 ? null : 'Chart is required';
            },
        },
    });
    const { onSubmit, values: formValues } = form;

    const convertFormValuesToCreateEmbedJwt = useCallback(
        (
            values: FormValues,
            isPreview: boolean = false,
        ): Omit<CreateEmbedJwt, 'content'> & {
            content: EmbedJwtContentChart;
        } => {
            return {
                expiresIn: values.expiresIn,
                content: {
                    type: 'chart',
                    projectUuid,
                    contentId: values.chartUuid!,
                    canExportCsv: values.canExportCsv,
                    canExportImages: values.canExportImages,
                    isPreview,
                    canViewUnderlyingData: values.canViewUnderlyingData,
                    scopes: undefined,
                    dashboardFiltersInteractivity: undefined,
                    parameterInteractivity: undefined,
                },
                userAttributes: values.userAttributes.reduce(
                    (acc, item) => ({
                        ...acc,
                        [item.key]: item.value,
                    }),
                    {},
                ),
                user: {
                    externalId: values.externalId,
                    email: values.email,
                },
            };
        },
        [projectUuid],
    );

    const handlePreview = useCallback(async () => {
        const state = form.validate();
        if (state.hasErrors) {
            return;
        }

        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(formValues, true),
        );
        window.open(data.url, '_blank');
    }, [formValues, form, convertFormValuesToCreateEmbedJwt, createEmbedUrl]);

    const generateUrl = useCallback(async () => {
        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(form.values),
        );
        return data.url;
    }, [convertFormValuesToCreateEmbedJwt, createEmbedUrl, form.values]);

    const { handleCopy } = useAsyncClipboard(generateUrl);
    const handleCopySubmit = onSubmit(handleCopy);

    return (
        <form id="generate-embed-url" onSubmit={handleCopySubmit}>
            <Stack gap="md" mb="md">
                <Select
                    required
                    label="Chart"
                    data={charts.map((chart) => ({
                        value: chart.uuid,
                        label: chart.name,
                    }))}
                    placeholder="Select a chart..."
                    searchable
                    {...form.getInputProps('chartUuid')}
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
                                                    style={{ flex: 1 }}
                                                    {...form.getInputProps(
                                                        `userAttributes.${index}.key`,
                                                    )}
                                                />
                                                <TextInput
                                                    size="xs"
                                                    placeholder="E.g. US"
                                                    style={{ flex: 1 }}
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

                <Paper p="md" withBorder>
                    <Stack gap="md">
                        <Title order={6}>Interactivity & Permissions</Title>
                        <Stack gap="xs">
                            <Text size="sm" fw={500}>
                                Users can:
                            </Text>
                            <Switch
                                {...form.getInputProps('canExportCsv', {
                                    type: 'checkbox',
                                })}
                                label="Export CSV"
                            />
                            <Switch
                                {...form.getInputProps('canExportImages', {
                                    type: 'checkbox',
                                })}
                                label="Export Images"
                            />
                            <Switch
                                {...form.getInputProps(
                                    'canViewUnderlyingData',
                                    {
                                        type: 'checkbox',
                                    },
                                )}
                                label="View underlying data"
                            />
                        </Stack>
                    </Stack>
                </Paper>

                <Flex justify="flex-end" gap="sm">
                    <Button
                        variant="light"
                        leftSection={<MantineIcon icon={IconEye} />}
                        onClick={handlePreview}
                    >
                        Preview
                    </Button>
                    <Button
                        variant="default"
                        type="submit"
                        leftSection={<MantineIcon icon={IconLink} />}
                    >
                        Generate & copy URL
                    </Button>
                </Flex>
            </Stack>

            <Stack gap="md" mb="md">
                <Stack gap="xs">
                    <Title order={5}>Code snippet</Title>
                    <Text c="dimmed" fz="sm">
                        Copy and paste this code snippet into your application
                        to generate embed URLs.
                    </Text>
                </Stack>
                <EmbedCodeSnippet
                    projectUuid={projectUuid}
                    siteUrl={siteUrl}
                    data={convertFormValuesToCreateEmbedJwt(formValues)}
                />
            </Stack>
        </form>
    );
};

export default EmbedPreviewChartForm;

import {
    FilterInteractivityValues,
    type ApiError,
    type CreateEmbedJwt,
    type DashboardBasicDetails,
    type DashboardFilterInteractivityOptions,
    type EmbedUrl,
    type IntrinsicUserAttributes,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Input,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
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
import EmbedFiltersInteractivity from './EmbedFiltersInteractivity';

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
    dashboardUuid: string | undefined;
    expiresIn: string;
    userAttributes: Array<{
        uuid: string;
        key: string;
        value: string;
    }>;
    dashboardFiltersInteractivity: DashboardFilterInteractivityOptions;
    canExportCsv?: boolean;
    canExportImages?: boolean;
    externalId?: string;
} & IntrinsicUserAttributes;

const EmbedUrlForm: FC<{
    projectUuid: string;
    siteUrl: string;
    dashboards: DashboardBasicDetails[];
}> = ({ projectUuid, siteUrl, dashboards }) => {
    const { mutateAsync: createEmbedUrl } =
        useEmbedUrlCreateMutation(projectUuid);
    const { data: user } = useUser(true);

    const form = useForm<FormValues>({
        initialValues: {
            dashboardUuid: undefined,
            expiresIn: '1 hour',
            userAttributes: [{ uuid: uuidv4(), key: '', value: '' }] as Array<{
                uuid: string;
                key: string;
                value: string;
            }>,
            email: user?.email,
            dashboardFiltersInteractivity: {
                enabled: FilterInteractivityValues.none,
            },
            canExportCsv: false,
            canExportImages: false,
        },
        validate: {
            dashboardUuid: (value: undefined | string) => {
                return value && value.length > 0
                    ? null
                    : 'Dashboard is required';
            },
        },
    });
    const { onSubmit, validate, values: formValues } = form;

    const convertFormValuesToCreateEmbedJwt = useCallback(
        (values: FormValues, isPreview: boolean = false): CreateEmbedJwt => {
            return {
                expiresIn: values.expiresIn,
                content: {
                    type: 'dashboard',
                    dashboardUuid: values.dashboardUuid!,
                    dashboardFiltersInteractivity: {
                        enabled: values.dashboardFiltersInteractivity?.enabled,
                        ...(values.dashboardFiltersInteractivity?.enabled ===
                        FilterInteractivityValues.some
                            ? {
                                  allowedFilters:
                                      values.dashboardFiltersInteractivity
                                          .allowedFilters,
                              }
                            : {}),
                    },
                    canExportCsv: values.canExportCsv,
                    canExportImages: values.canExportImages,
                    isPreview,
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
        [],
    );

    const handlePreview = useCallback(async () => {
        const state = validate();
        if (state.hasErrors) {
            return;
        }

        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(formValues, true),
        );
        //Open data.url on new tab
        window.open(data.url, '_blank');
    }, [
        formValues,
        validate,
        convertFormValuesToCreateEmbedJwt,
        createEmbedUrl,
    ]);

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
            <Stack mb={'md'}>
                <Stack spacing="xs">
                    <Title order={5}>Preview</Title>
                    <Text color="dimmed">
                        Preview your embed URL and copy it to your clipboard.
                    </Text>
                </Stack>
                <Select
                    required
                    label={'Dashboard'}
                    data={dashboards.map((dashboard) => ({
                        value: dashboard.uuid,
                        label: dashboard.name,
                    }))}
                    placeholder="Select a dashboard..."
                    searchable
                    withinPortal
                    {...form.getInputProps('dashboardUuid')}
                />
                <Select
                    required
                    label={'Expires in'}
                    data={['1 hour', '1 day', '1 week', '30 days', '1 year']}
                    withinPortal
                    {...form.getInputProps('expiresIn')}
                />
                <Input.Wrapper label="User identifier">
                    <TextInput
                        size={'xs'}
                        placeholder="1234"
                        {...form.getInputProps(`externalId`)}
                    />
                </Input.Wrapper>
                <Input.Wrapper label="User email">
                    <TextInput
                        size={'xs'}
                        placeholder="Type an email to add as intrinsic user attribute"
                        {...form.getInputProps('email')}
                    />
                </Input.Wrapper>
                <Input.Wrapper label="User attributes">
                    {form.values.userAttributes.map((item, index) => (
                        <Group key={item.uuid} mt="xs">
                            <TextInput
                                size={'xs'}
                                placeholder="E.g. user_country"
                                {...form.getInputProps(
                                    `userAttributes.${index}.key`,
                                )}
                            />
                            <TextInput
                                size={'xs'}
                                placeholder="E.g. US"
                                {...form.getInputProps(
                                    `userAttributes.${index}.value`,
                                )}
                            />
                            <ActionIcon
                                variant="light"
                                onClick={() =>
                                    form.removeListItem('userAttributes', index)
                                }
                            >
                                <MantineIcon color="red" icon={IconTrash} />
                            </ActionIcon>
                        </Group>
                    ))}
                    <Group>
                        <Button
                            size="xs"
                            mr="xxs"
                            variant="default"
                            mt="xs"
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={() =>
                                form.insertListItem('userAttributes', {
                                    key: '',
                                    value: '',
                                    uuid: uuidv4(),
                                })
                            }
                        >
                            Add attribute
                        </Button>
                    </Group>
                </Input.Wrapper>
                <Input.Wrapper label="Interactivity">
                    <EmbedFiltersInteractivity
                        dashboardUuid={
                            form.getInputProps('dashboardUuid').value
                        }
                        onInteractivityOptionsChange={(
                            interactivityOptions,
                        ) => {
                            form.setFieldValue(
                                'dashboardFiltersInteractivity',
                                interactivityOptions,
                            );
                        }}
                        interactivityOptions={
                            form.getInputProps('dashboardFiltersInteractivity')
                                .value
                        }
                    />
                </Input.Wrapper>
                <Switch
                    {...form.getInputProps(`canExportCsv`)}
                    labelPosition="left"
                    label={`Can export CSV`}
                />
                <Switch
                    {...form.getInputProps(`canExportImages`)}
                    labelPosition="left"
                    label={`Can export Images`}
                />
                <Flex justify="flex-end" gap="sm">
                    <Button
                        variant={'light'}
                        leftIcon={<MantineIcon icon={IconEye} />}
                        onClick={handlePreview}
                    >
                        Preview
                    </Button>
                    <Button
                        variant={'outline'}
                        type="submit"
                        leftIcon={<MantineIcon icon={IconLink} />}
                    >
                        Generate & copy URL
                    </Button>
                </Flex>
            </Stack>
            <Stack mb="md">
                <Stack spacing="xs">
                    <Title order={5}>Code snippet</Title>
                    <Text color="dimmed">
                        Copy and paste this code snippet into your application
                        to generate embed urls.
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

export default EmbedUrlForm;

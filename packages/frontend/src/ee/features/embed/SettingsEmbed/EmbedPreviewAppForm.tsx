import {
    getAppDisplayName,
    type ApiError,
    type CreateEmbedJwt,
    type EmbedJwtContentDataApp,
    type EmbedProjectApp,
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
} from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconEye, IconLink, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { lightdashApi } from '../../../../api';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useAsyncClipboard } from '../../../../hooks/useAsyncClipboard';
import useUser from '../../../../hooks/user/useUser';
import i18n from '../../../../i18n/i18n';
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
                    title: i18n.t('preview.toasts.urlCreateFailed', {
                        ns: 'embed',
                    }),
                    subtitle: error.error.message,
                });
            },
        },
    );
};

type FormValues = {
    appUuid: string | undefined;
    expiresIn: string;
    userAttributes: Array<{
        uuid: string;
        key: string;
        value: string;
    }>;
    externalId?: string;
} & IntrinsicUserAttributes;

const EmbedPreviewAppForm: FC<{
    projectUuid: string;
    siteUrl: string;
    apps: EmbedProjectApp[];
}> = ({ projectUuid, siteUrl, apps }) => {
    const { t } = useTranslation('embed');
    const { mutateAsync: createEmbedUrl } =
        useEmbedUrlCreateMutation(projectUuid);
    const { colorScheme } = useMantineColorScheme();
    const { data: user } = useUser(true);

    const form = useForm<FormValues>({
        initialValues: {
            appUuid: undefined,
            expiresIn: '1 hour',
            userAttributes: [{ uuid: uuidv4(), key: '', value: '' }] as Array<{
                uuid: string;
                key: string;
                value: string;
            }>,
            email: user?.email,
        },
        validate: {
            appUuid: (value: undefined | string) => {
                return value && value.length > 0
                    ? null
                    : t('preview.dataAppRequired');
            },
        },
    });
    const { onSubmit, values: formValues } = form;

    const convertFormValuesToCreateEmbedJwt = useCallback(
        (
            values: FormValues,
            isPreview: boolean = false,
        ): Omit<CreateEmbedJwt, 'content'> & {
            content: EmbedJwtContentDataApp;
        } => {
            return {
                expiresIn: values.expiresIn,
                content: {
                    type: 'dataApp',
                    projectUuid,
                    appUuid: values.appUuid!,
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
        // Open data.url in a new tab, matching the current app color scheme
        const previewUrl = new URL(data.url);
        previewUrl.searchParams.set('theme', colorScheme);
        window.open(previewUrl.toString(), '_blank', 'noopener,noreferrer');
    }, [
        formValues,
        form,
        convertFormValuesToCreateEmbedJwt,
        createEmbedUrl,
        colorScheme,
    ]);

    const generateUrl = useCallback(async () => {
        const data = await createEmbedUrl(
            convertFormValuesToCreateEmbedJwt(form.values),
        );
        // Match the current app color scheme
        const url = new URL(data.url);
        url.searchParams.set('theme', colorScheme);
        return url.toString();
    }, [
        convertFormValuesToCreateEmbedJwt,
        createEmbedUrl,
        form.values,
        colorScheme,
    ]);

    const { handleCopy } = useAsyncClipboard(generateUrl);
    const handleCopySubmit = onSubmit(handleCopy);

    return (
        <form id="generate-embed-url-app" onSubmit={handleCopySubmit}>
            <Stack gap="md" mb="md">
                <Select
                    required
                    label={t('preview.dataApp')}
                    data={apps.map((app) => ({
                        value: app.appUuid,
                        label: getAppDisplayName(app.name, app.appUuid),
                    }))}
                    placeholder={
                        apps.length === 0
                            ? t('allowList.noApps')
                            : t('allowList.selectApp')
                    }
                    disabled={apps.length === 0}
                    searchable
                    {...form.getInputProps('appUuid')}
                />

                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        {t('preview.expiresIn')}
                    </Text>
                    <SegmentedControl
                        value={form.values.expiresIn}
                        onChange={(value) =>
                            form.setFieldValue('expiresIn', value)
                        }
                        data={[
                            {
                                label: t('preview.expiry.hour'),
                                value: '1 hour',
                            },
                            { label: t('preview.expiry.day'), value: '1 day' },
                            {
                                label: t('preview.expiry.week'),
                                value: '1 week',
                            },
                            {
                                label: t('preview.expiry.days30'),
                                value: '30 days',
                            },
                            {
                                label: t('preview.expiry.year'),
                                value: '1 year',
                            },
                        ]}
                        size="xs"
                    />
                </Stack>

                <Paper p="md">
                    <Stack gap="md">
                        <Title order={6}>{t('preview.identification')}</Title>
                        <Stack gap="xs">
                            <Input.Wrapper label={t('preview.userIdentifier')}>
                                <TextInput
                                    size="xs"
                                    placeholder="1234"
                                    {...form.getInputProps('externalId')}
                                />
                            </Input.Wrapper>

                            <Input.Wrapper label={t('preview.userEmail')}>
                                <TextInput
                                    size="xs"
                                    placeholder={t(
                                        'preview.userEmailPlaceholder',
                                    )}
                                    {...form.getInputProps('email')}
                                />
                            </Input.Wrapper>

                            <Input.Wrapper label={t('preview.userAttributes')}>
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
                                                    placeholder={t(
                                                        'preview.attributeKeyPlaceholder',
                                                    )}
                                                    flex={1}
                                                    {...form.getInputProps(
                                                        `userAttributes.${index}.key`,
                                                    )}
                                                />
                                                <TextInput
                                                    size="xs"
                                                    placeholder={t(
                                                        'preview.attributeValuePlaceholder',
                                                    )}
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
                                        {t('preview.addAttribute')}
                                    </Button>
                                </Stack>
                            </Input.Wrapper>
                        </Stack>
                    </Stack>
                </Paper>

                <Flex justify="flex-end" gap="sm">
                    <Button
                        variant="light"
                        leftSection={<MantineIcon icon={IconEye} />}
                        onClick={handlePreview}
                    >
                        {t('preview.preview')}
                    </Button>
                    <Button
                        variant="default"
                        type="submit"
                        leftSection={<MantineIcon icon={IconLink} />}
                    >
                        {t('preview.generateUrl')}
                    </Button>
                </Flex>
            </Stack>

            <Stack gap="md" mb="md">
                <Stack gap="xs">
                    <Title order={5}>{t('preview.iframeCode')}</Title>
                    <Text c="dimmed" fz="sm">
                        {t('preview.iframeDescription')}
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

export default EmbedPreviewAppForm;

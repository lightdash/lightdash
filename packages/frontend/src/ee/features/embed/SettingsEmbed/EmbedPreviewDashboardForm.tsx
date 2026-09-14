import {
    FeatureFlags,
    FilterInteractivityValues,
    type ApiError,
    type CreateEmbedJwt,
    type DashboardBasicDetails,
    type DashboardFilterInteractivityOptions,
    type EmbedUrl,
    type IntrinsicUserAttributes,
    type ParameterInteractivityOptions,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Divider,
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
    Tooltip,
    useComputedColorScheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconEye,
    IconFlask2Filled,
    IconInfoCircle,
    IconLink,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState, type FC, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { lightdashApi } from '../../../../api';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useAsyncClipboard } from '../../../../hooks/useAsyncClipboard';
import useUser from '../../../../hooks/user/useUser';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import EmbedCodeSnippet, { type EmbedMethod } from './EmbedCodeSnippet';
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
    parameterInteractivity: ParameterInteractivityOptions;
    canExportCsv?: boolean;
    canExportDashboardCsv?: boolean;
    canExportImages?: boolean;
    externalId?: string;
    canExportPagePdf?: boolean;
    canDateZoom?: boolean;
    canExplore?: boolean;
    canViewUnderlyingData?: boolean;
    canViewDataApps?: boolean;
    stickyHeader?: boolean;
} & IntrinsicUserAttributes;

const EmbedPreviewDashboardForm: FC<{
    projectUuid: string;
    siteUrl: string;
    dashboards: DashboardBasicDetails[];
    writeActions?: CreateEmbedJwt['writeActions'];
    writeActionsPanel?: ReactNode;
    onDashboardSpaceChange?: (spaceUuid: string | undefined) => void;
}> = ({
    projectUuid,
    siteUrl,
    dashboards,
    writeActions,
    writeActionsPanel,
    onDashboardSpaceChange,
}) => {
    const { mutateAsync: createEmbedUrl } =
        useEmbedUrlCreateMutation(projectUuid);
    const colorScheme = useComputedColorScheme();
    const { data: user } = useUser(true);
    const [embedMethod, setEmbedMethod] = useState<EmbedMethod>('iframe');
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled === true;

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
                hidden: false,
                canAddFilters: false,
            },
            parameterInteractivity: {
                enabled: false,
            },
            canExportCsv: false,
            canExportDashboardCsv: false,
            canExportImages: false,
            canDateZoom: false,
            canExportPagePdf: true,
            canExplore: false,
            canViewUnderlyingData: false,
            canViewDataApps: false,
            stickyHeader: false,
        },
        validate: {
            dashboardUuid: (value: undefined | string) => {
                return value && value.length > 0
                    ? null
                    : 'Dashboard is required';
            },
        },
    });
    const { onSubmit, values: formValues } = form;

    const convertFormValuesToCreateEmbedJwt = useCallback(
        (values: FormValues, isPreview: boolean = false): CreateEmbedJwt => {
            return {
                expiresIn: values.expiresIn,
                content: {
                    type: 'dashboard',
                    projectUuid,
                    dashboardUuid: values.dashboardUuid!,
                    dashboardFiltersInteractivity: {
                        enabled: values.dashboardFiltersInteractivity?.enabled,
                        hidden:
                            values.dashboardFiltersInteractivity?.hidden ??
                            false,
                        canAddFilters:
                            values.dashboardFiltersInteractivity
                                ?.canAddFilters ?? false,
                        ...(values.dashboardFiltersInteractivity?.enabled ===
                        FilterInteractivityValues.some
                            ? {
                                  allowedFilters:
                                      values.dashboardFiltersInteractivity
                                          .allowedFilters,
                              }
                            : {}),
                    },
                    parameterInteractivity: values.parameterInteractivity,
                    canExportCsv: values.canExportCsv,
                    canExportDashboardCsv: values.canExportDashboardCsv,
                    canExportImages: values.canExportImages,
                    isPreview,
                    canDateZoom: values.canDateZoom,
                    canExportPagePdf: values.canExportPagePdf ?? true,
                    canExplore: values.canExplore,
                    canViewUnderlyingData: values.canViewUnderlyingData,
                    canViewDataApps: values.canViewDataApps,
                    stickyHeader: values.stickyHeader,
                },
                writeActions,
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
        [writeActions, projectUuid],
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
        <form id="generate-embed-url" onSubmit={handleCopySubmit}>
            <Stack gap="md" mb="md">
                <Select
                    required
                    label="Dashboard"
                    data={dashboards.map((dashboard) => ({
                        value: dashboard.uuid,
                        label: dashboard.name,
                    }))}
                    placeholder="Select a dashboard..."
                    searchable
                    {...form.getInputProps('dashboardUuid')}
                    onChange={(dashboardUuid) => {
                        form.setFieldValue(
                            'dashboardUuid',
                            dashboardUuid ?? undefined,
                        );
                        onDashboardSpaceChange?.(
                            dashboards.find(
                                (dashboard) => dashboard.uuid === dashboardUuid,
                            )?.spaceUuid,
                        );
                    }}
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

                <Paper p="md">
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

                <Paper p="md">
                    <Stack gap="sm">
                        <Title order={6}>Interactivity & Permissions</Title>
                        <Stack gap="md">
                            <EmbedFiltersInteractivity
                                dashboardUuid={form.values.dashboardUuid}
                                onInteractivityOptionsChange={(
                                    interactivityOptions,
                                ) => {
                                    form.setFieldValue(
                                        'dashboardFiltersInteractivity',
                                        interactivityOptions,
                                    );
                                }}
                                interactivityOptions={
                                    form.values.dashboardFiltersInteractivity
                                }
                            />

                            <Stack gap="xs">
                                <Text size="sm" fw={500}>
                                    Users can:
                                </Text>
                                <Switch
                                    checked={
                                        form.values.parameterInteractivity
                                            .enabled
                                    }
                                    onChange={(event) =>
                                        form.setFieldValue(
                                            'parameterInteractivity',
                                            {
                                                enabled:
                                                    event.currentTarget.checked,
                                            },
                                        )
                                    }
                                    label="Change parameters"
                                />
                                <Switch
                                    {...form.getInputProps('canExportCsv', {
                                        type: 'checkbox',
                                    })}
                                    label="Export CSV (per tile)"
                                />
                                <Switch
                                    {...form.getInputProps(
                                        'canExportDashboardCsv',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                    label="Export all tiles (CSV/XLSX ZIP)"
                                />
                                <Switch
                                    {...form.getInputProps('canExportImages', {
                                        type: 'checkbox',
                                    })}
                                    label="Export Images"
                                />
                                <Switch
                                    {...form.getInputProps('canExportPagePdf', {
                                        type: 'checkbox',
                                    })}
                                    label="Export page to PDF"
                                    defaultChecked={true}
                                />
                                <Switch
                                    {...form.getInputProps('canDateZoom', {
                                        type: 'checkbox',
                                    })}
                                    label="Date zoom"
                                />
                                <Switch
                                    {...form.getInputProps('canExplore', {
                                        type: 'checkbox',
                                    })}
                                    label="Explore charts"
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
                                {dataAppsEnabled && (
                                    <Switch
                                        {...form.getInputProps(
                                            'canViewDataApps',
                                            { type: 'checkbox' },
                                        )}
                                        label={
                                            <Group gap="xs">
                                                <Text inherit>
                                                    View data apps
                                                </Text>
                                                <Tooltip
                                                    label="Lets data apps run project-wide metric queries and use external connections linked by an admin."
                                                    maw="300px"
                                                    position="right"
                                                >
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                        size="sm"
                                                    />
                                                </Tooltip>
                                            </Group>
                                        }
                                    />
                                )}
                            </Stack>

                            <Stack gap="xs">
                                <Text size="sm" fw={500}>
                                    Appearance:
                                </Text>
                                <Switch
                                    {...form.getInputProps('stickyHeader', {
                                        type: 'checkbox',
                                    })}
                                    label="Sticky header (keep tabs & filters visible when scrolling)"
                                />
                            </Stack>
                        </Stack>
                    </Stack>
                </Paper>

                {writeActionsPanel && (
                    <Paper p="md">
                        <Stack gap="xs" mb="md">
                            <Group gap="sm">
                                <Title order={6}>Write actions</Title>
                                <Badge
                                    color="violet"
                                    size="sm"
                                    leftSection={<IconFlask2Filled size={12} />}
                                >
                                    Experimental
                                </Badge>
                            </Group>
                            <Text c="dimmed" fz="sm">
                                Choose which Lightdash actor should power
                                embedded actions like creating scheduled
                                deliveries or saving charts.
                            </Text>
                        </Stack>
                        {writeActionsPanel}
                    </Paper>
                )}

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

            <Divider mb="md" />

            <Stack gap="md" mb="md">
                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        Embed method
                    </Text>
                    <SegmentedControl
                        value={embedMethod}
                        onChange={(value) =>
                            setEmbedMethod(value as EmbedMethod)
                        }
                        data={[
                            { label: 'Iframe', value: 'iframe' },
                            { label: 'SDK', value: 'sdk' },
                        ]}
                    />
                </Stack>
                <Stack gap="xs">
                    <Title order={5}>
                        {embedMethod === 'iframe'
                            ? 'Iframe embed code'
                            : 'React SDK code'}
                    </Title>
                    <Text c="dimmed" fz="sm">
                        {embedMethod === 'iframe'
                            ? 'Use this for iframe or direct embedding with a full embed URL.'
                            : 'Use this for React SDK embedding with a backend-generated JWT.'}
                    </Text>
                </Stack>
                <EmbedCodeSnippet
                    mode={embedMethod}
                    projectUuid={projectUuid}
                    siteUrl={siteUrl}
                    data={convertFormValuesToCreateEmbedJwt(formValues)}
                />
            </Stack>
        </form>
    );
};

export default EmbedPreviewDashboardForm;

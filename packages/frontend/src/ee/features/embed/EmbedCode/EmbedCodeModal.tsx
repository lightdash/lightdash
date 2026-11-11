import {
    type ApiError,
    type CreateEmbedJwt,
    assertUnreachable,
    FilterInteractivityValues,
    FeatureFlags,
    type DashboardFilterInteractivityOptions,
    type DecodedEmbed,
    type EmbedUrl,
    type UpdateEmbed,
} from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Anchor,
    Badge,
    Button,
    Group,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    Tabs,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconBrandReact,
    IconCode,
    IconFrame,
    IconPlus,
    IconServer,
    IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import Callout from '../../../../components/common/Callout';
import CodeBlock from '../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import {
    CodeSnippetTabs,
    ReactSdkFrontendCodeBlock,
} from '../SettingsEmbed/EmbedCodeSnippet';
import EmbedFiltersInteractivity from '../SettingsEmbed/EmbedFiltersInteractivity';
import EmbedWriteActionsForm from '../SettingsEmbed/EmbedWriteActionsForm';
import classes from './EmbedCodeModal.module.css';
import {
    getEmbedCodeAvailability,
    getConfigAllowingTarget,
    type EmbedCodeTarget,
} from './embedCodeUtils';

const URL_PLACEHOLDER = '{{ url }}';
// The same lifetimes Settings → Embed offers
const EXPIRY_OPTIONS = ['1 hour', '1 day', '1 week', '30 days', '1 year'];
const DEFAULT_EXPIRY = '1 hour';

const getIframeHtml = (url: string) => `<iframe
    src="${url}"
    width="100%"
    height="600"
    frameborder="0"
></iframe>`;

const SDK_INSTALL = 'npm install @lightdash/sdk';

type EmbedTab = 'iframe' | 'sdk' | 'backend';

const isEmbedTab = (value: string | null): value is EmbedTab =>
    value === 'iframe' || value === 'sdk' || value === 'backend';

const useEmbedConfig = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<DecodedEmbed, ApiError>({
        queryKey: ['embed-config', projectUuid],
        queryFn: async () =>
            lightdashApi<DecodedEmbed>({
                url: `/embed/${projectUuid}/config`,
                method: 'GET',
                body: undefined,
            }),
        retry: false,
    });
};

// The server signs the URL, so the embed secret never reaches the browser
const useTestEmbedUrl = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useMutation<EmbedUrl, ApiError, CreateEmbedJwt>({
        mutationKey: ['create-embed-url', projectUuid],
        mutationFn: (data) =>
            lightdashApi<EmbedUrl>({
                url: `/embed/${projectUuid}/get-embed-url`,
                method: 'POST',
                body: JSON.stringify(data),
            }),
    });
};

const useAllowEmbedTarget = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, UpdateEmbed>({
        mutationKey: ['update-embed-config', projectUuid],
        mutationFn: (data) =>
            lightdashApi<null>({
                url: `/embed/${projectUuid}/config`,
                method: 'PATCH',
                body: JSON.stringify(data),
            }),
        onSuccess: () => queryClient.invalidateQueries(['embed-config']),
    });
};

type EmbedFormValues = {
    expiresIn: string;
    externalId: string;
    email: string;
    userAttributes: { uuid: string; key: string; value: string }[];
    canExportCsv: boolean;
    canExportImages: boolean;
    canViewUnderlyingData: boolean;
    // Dashboard only
    dashboardFiltersInteractivity: DashboardFilterInteractivityOptions;
    canChangeParameters: boolean;
    canExportDashboardCsv: boolean;
    canExportPagePdf: boolean;
    canDateZoom: boolean;
    canExplore: boolean;
    canViewDataApps: boolean;
    stickyHeader: boolean;
};

// The same defaults as the Settings → Embed preview forms
const INITIAL_VALUES: EmbedFormValues = {
    expiresIn: DEFAULT_EXPIRY,
    externalId: '',
    email: '',
    userAttributes: [],
    canExportCsv: false,
    canExportImages: false,
    canViewUnderlyingData: false,
    dashboardFiltersInteractivity: {
        enabled: FilterInteractivityValues.none,
        hidden: false,
        canAddFilters: false,
    },
    canChangeParameters: false,
    canExportDashboardCsv: false,
    canExportPagePdf: true,
    canDateZoom: false,
    canExplore: false,
    canViewDataApps: false,
    stickyHeader: false,
};

const getEmbedContent = (
    projectUuid: string,
    type: EmbedCodeTarget['type'],
    uuid: string,
    values: EmbedFormValues,
): CreateEmbedJwt['content'] => {
    switch (type) {
        case 'chart':
            return {
                type: 'chart',
                projectUuid,
                contentId: uuid,
                canExportCsv: values.canExportCsv,
                canExportImages: values.canExportImages,
                canViewUnderlyingData: values.canViewUnderlyingData,
                isPreview: false,
                scopes: undefined,
                dashboardFiltersInteractivity: undefined,
                parameterInteractivity: undefined,
            };
        case 'dashboard': {
            const filters = values.dashboardFiltersInteractivity;
            return {
                type: 'dashboard',
                projectUuid,
                dashboardUuid: uuid,
                dashboardFiltersInteractivity: {
                    enabled: filters.enabled,
                    hidden: filters.hidden ?? false,
                    canAddFilters: filters.canAddFilters ?? false,
                    ...(filters.enabled === FilterInteractivityValues.some
                        ? { allowedFilters: filters.allowedFilters }
                        : {}),
                },
                parameterInteractivity: {
                    enabled: values.canChangeParameters,
                },
                canExportCsv: values.canExportCsv,
                canExportDashboardCsv: values.canExportDashboardCsv,
                canExportImages: values.canExportImages,
                canExportPagePdf: values.canExportPagePdf,
                canDateZoom: values.canDateZoom,
                canExplore: values.canExplore,
                canViewUnderlyingData: values.canViewUnderlyingData,
                canViewDataApps: values.canViewDataApps,
                stickyHeader: values.stickyHeader,
                isPreview: false,
            };
        }
        default:
            return assertUnreachable(type, `Unknown embed target: ${type}`);
    }
};

const getUserAttributes = (
    attributes: EmbedFormValues['userAttributes'],
): Record<string, string> =>
    Object.fromEntries(
        attributes
            .filter(({ key }) => key.trim() !== '')
            .map(({ key, value }) => [key.trim(), value]),
    );

type PermissionField =
    | 'canExportCsv'
    | 'canExportImages'
    | 'canViewUnderlyingData'
    | 'canChangeParameters'
    | 'canExportDashboardCsv'
    | 'canExportPagePdf'
    | 'canDateZoom'
    | 'canExplore'
    | 'canViewDataApps'
    | 'stickyHeader';

type PermissionSwitch = { field: PermissionField; label: string };

// The same switches and labels as the Settings → Embed preview forms
const getPermissionSwitches = (
    type: EmbedCodeTarget['type'],
    dataAppsEnabled: boolean,
): PermissionSwitch[] => {
    switch (type) {
        case 'chart':
            return [
                { field: 'canExportCsv', label: 'Export CSV' },
                { field: 'canExportImages', label: 'Export Images' },
                {
                    field: 'canViewUnderlyingData',
                    label: 'View underlying data',
                },
            ];
        case 'dashboard':
            return [
                { field: 'canChangeParameters', label: 'Change parameters' },
                { field: 'canExportCsv', label: 'Export CSV (per tile)' },
                {
                    field: 'canExportDashboardCsv',
                    label: 'Export all tiles (CSV/XLSX ZIP)',
                },
                { field: 'canExportImages', label: 'Export Images' },
                { field: 'canExportPagePdf', label: 'Export page to PDF' },
                { field: 'canDateZoom', label: 'Date zoom' },
                { field: 'canExplore', label: 'Explore charts' },
                {
                    field: 'canViewUnderlyingData',
                    label: 'View underlying data',
                },
                ...(dataAppsEnabled
                    ? [
                          {
                              field: 'canViewDataApps' as const,
                              label: 'View data apps',
                          },
                      ]
                    : []),
                { field: 'stickyHeader', label: 'Sticky header' },
            ];
        default:
            return assertUnreachable(type, `Unknown embed target: ${type}`);
    }
};

type Props = {
    projectUuid: string;
    target: EmbedCodeTarget;
    onClose: () => void;
};

const EmbedCodeModal: FC<Props> = ({ projectUuid, target, onClose }) => {
    const { health } = useApp();
    const { showToastSuccess, showToastApiError } = useToaster();
    const testEmbedUrl = useTestEmbedUrl(projectUuid);
    const allowEmbedTarget = useAllowEmbedTarget(projectUuid);
    const [tab, setTab] = useState<EmbedTab>('iframe');
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const dataAppsEnabled = dataAppsFlag.data?.enabled === true;
    const form = useForm<EmbedFormValues>({
        initialValues: INITIAL_VALUES,
        // A generated URL was signed for the old values
        onValuesChange: () => testEmbedUrl.reset(),
    });
    const [writeActions, setWriteActions] =
        useState<CreateEmbedJwt['writeActions']>();
    const { reset: resetTestEmbedUrl } = testEmbedUrl;
    // Must be stable: the write actions form calls it from an effect
    const handleWriteActionsChange = useCallback(
        (value: CreateEmbedJwt['writeActions']) => {
            setWriteActions(value);
            resetTestEmbedUrl();
        },
        [resetTestEmbedUrl],
    );
    const { values } = form;
    const { expiresIn, externalId, email, userAttributes } = values;
    const attributeCount = Object.keys(
        getUserAttributes(userAttributes),
    ).length;
    const permissionSwitches = getPermissionSwitches(
        target.type,
        dataAppsEnabled,
    );
    const permissionCount =
        permissionSwitches.filter(({ field }) => values[field]).length +
        (target.type === 'dashboard' &&
        values.dashboardFiltersInteractivity.enabled !==
            FilterInteractivityValues.none
            ? 1
            : 0);
    const hasViewerIdentity = externalId.trim() !== '' || email.trim() !== '';
    const handleCopy = useCallback(
        () => showToastSuccess({ title: 'Code snippet copied to clipboard!' }),
        [showToastSuccess],
    );
    const embedConfig = useEmbedConfig(projectUuid);
    const availability = getEmbedCodeAvailability({
        isLoading: embedConfig.isInitialLoading,
        hasError: embedConfig.isError,
        errorStatusCode: embedConfig.error?.error.statusCode,
        config: embedConfig.data,
        target,
    });
    const canGenerateTestUrl = availability === 'ready';
    const settingsUrl = `/generalSettings/projectManagement/${projectUuid}/embed`;

    const embedJwt = useMemo<CreateEmbedJwt>(
        () => ({
            expiresIn: values.expiresIn,
            content: getEmbedContent(
                projectUuid,
                target.type,
                target.uuid,
                values,
            ),
            writeActions,
            userAttributes: getUserAttributes(values.userAttributes),
            user: {
                externalId: values.externalId.trim() || undefined,
                email: values.email.trim() || undefined,
            },
        }),
        // Callers pass a fresh target object each render
        [projectUuid, target.type, target.uuid, values, writeActions],
    );

    const renderStatus = () => {
        switch (availability) {
            case 'loading':
            case 'ready':
                return null;
            case 'featureUnavailable':
                return (
                    <Callout
                        variant="warning"
                        title="Embedding is not available"
                    >
                        This project does not currently have access to the
                        embedding feature.
                    </Callout>
                );
            case 'notConfigured':
                return (
                    <Callout
                        variant="warning"
                        title="Embedding is not set up yet"
                    >
                        Create an embed secret in{' '}
                        <Anchor component={Link} to={settingsUrl} fz="sm">
                            Settings → Embed
                        </Anchor>{' '}
                        before generating a test URL.
                    </Callout>
                );
            case 'loadError':
                return (
                    <Callout
                        variant="warning"
                        title="Could not load the embedding configuration"
                    >
                        <Stack gap="xs" align="flex-start">
                            <Text fz="sm">
                                Try again before generating a test URL or
                                changing the allow list.
                            </Text>
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => void embedConfig.refetch()}
                            >
                                Try again
                            </Button>
                        </Stack>
                    </Callout>
                );
            case 'targetNotAllowed': {
                const config = embedConfig.data;
                if (!config) return null;
                return (
                    <Callout
                        variant="warning"
                        title={`This ${target.type} is not allowed for embedding yet`}
                    >
                        <Stack gap="xs" align="flex-start">
                            <Text fz="sm">
                                Until it is on the allow list, the embed will be
                                rejected. You can manage the full list in{' '}
                                <Anchor
                                    component={Link}
                                    to={settingsUrl}
                                    fz="sm"
                                >
                                    Settings → Embed
                                </Anchor>
                                .
                            </Text>
                            <Button
                                size="xs"
                                variant="default"
                                loading={allowEmbedTarget.isLoading}
                                onClick={() =>
                                    allowEmbedTarget.mutate(
                                        getConfigAllowingTarget(config, target),
                                        {
                                            onSuccess: () =>
                                                showToastSuccess({
                                                    title: `This ${target.type} is now allowed for embedding`,
                                                }),
                                            onError: ({ error }) =>
                                                showToastApiError({
                                                    title: `Could not allow this ${target.type} for embedding`,
                                                    apiError: error,
                                                }),
                                        },
                                    )
                                }
                            >
                                Allow this {target.type}
                            </Button>
                        </Stack>
                    </Callout>
                );
            }
            default:
                return assertUnreachable(
                    availability,
                    `Unknown embed code availability: ${availability}`,
                );
        }
    };

    if (!health.data) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Embed code"
            subtitle={target.name}
            icon={IconCode}
            size="xl"
            cancelLabel="Close"
            actions={<></>}
        >
            <Stack gap="md" className={classes.content}>
                {renderStatus()}
                <Tabs
                    value={tab}
                    onChange={(value) => {
                        if (isEmbedTab(value)) setTab(value);
                    }}
                    keepMounted={false}
                >
                    <Tabs.List>
                        <Tabs.Tab
                            value="iframe"
                            leftSection={<MantineIcon icon={IconFrame} />}
                        >
                            iframe
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="sdk"
                            leftSection={<MantineIcon icon={IconBrandReact} />}
                        >
                            React SDK
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="backend"
                            leftSection={<MantineIcon icon={IconServer} />}
                        >
                            Backend
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="iframe" pt="md">
                        <Stack gap="xs">
                            <Text c="dimmed" fz="sm">
                                Point an iframe at the signed <code>url</code>{' '}
                                your backend returns.{' '}
                                <Anchor
                                    component="button"
                                    fz="sm"
                                    onClick={() => setTab('backend')}
                                >
                                    See the backend code
                                </Anchor>
                                {' · '}
                                <Anchor
                                    href="https://docs.lightdash.com/references/iframe-embedding"
                                    target="_blank"
                                    fz="sm"
                                >
                                    iframe embed docs
                                </Anchor>
                            </Text>
                            <CodeBlock
                                code={getIframeHtml(
                                    testEmbedUrl.data?.url ?? URL_PLACEHOLDER,
                                )}
                                language="html"
                                onCopy={handleCopy}
                            />
                            {testEmbedUrl.data ? (
                                <Callout
                                    variant="warning"
                                    title="Test URL — do not ship this"
                                >
                                    This URL is signed for {expiresIn}{' '}
                                    {hasViewerIdentity
                                        ? 'with the viewer details above'
                                        : 'and carries no viewer identity'}
                                    . In production your backend must sign a
                                    fresh URL for each viewer.
                                </Callout>
                            ) : (
                                <Group gap="sm">
                                    <Button
                                        size="xs"
                                        variant="default"
                                        disabled={!canGenerateTestUrl}
                                        loading={testEmbedUrl.isLoading}
                                        onClick={() =>
                                            testEmbedUrl.mutate(embedJwt, {
                                                onError: ({ error }) =>
                                                    showToastApiError({
                                                        title: 'Could not generate a test URL',
                                                        apiError: error,
                                                    }),
                                            })
                                        }
                                    >
                                        Generate test URL
                                    </Button>
                                    <Text c="dimmed" fz="xs">
                                        Fills the snippet with a working URL
                                        that expires in {expiresIn}.
                                    </Text>
                                </Group>
                            )}
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="sdk" pt="md">
                        <Stack gap="xs">
                            <Text c="dimmed" fz="sm">
                                Install the SDK, then mount the {target.type}{' '}
                                with the signed <code>token</code> your backend
                                returns.{' '}
                                <Anchor
                                    component="button"
                                    fz="sm"
                                    onClick={() => setTab('backend')}
                                >
                                    See the backend code
                                </Anchor>
                                {' · '}
                                <Anchor
                                    href="https://docs.lightdash.com/references/react-sdk#embedding-with-react-sdk"
                                    target="_blank"
                                    fz="sm"
                                >
                                    React SDK docs
                                </Anchor>
                            </Text>
                            <CodeBlock
                                code={SDK_INSTALL}
                                language="bash"
                                onCopy={handleCopy}
                            />
                            <ReactSdkFrontendCodeBlock
                                data={embedJwt}
                                siteUrl={health.data.siteUrl}
                                onCopy={handleCopy}
                            />
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="backend" pt="md">
                        <Stack gap="xs">
                            <Title order={6}>Sign the embed token</Title>
                            <Text c="dimmed" fz="sm">
                                Run this on your server. It produces a{' '}
                                <code>token</code> for the React SDK and a{' '}
                                <code>url</code> for the iframe. Your embed
                                secret is in{' '}
                                <Anchor
                                    component={Link}
                                    to={settingsUrl}
                                    fz="sm"
                                >
                                    Settings → Embed
                                </Anchor>
                                . Never ship it to the browser.
                            </Text>
                            <CodeSnippetTabs
                                data={embedJwt}
                                mode="iframe"
                                onCopySnippet={handleCopy}
                                projectUuid={projectUuid}
                                siteUrl={health.data.siteUrl}
                            />
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
                <Text fz="sm" fw={500}>
                    Customize the token
                </Text>
                <Group gap="sm" align="flex-start" grow>
                    <Select
                        size="xs"
                        label="Token signed for"
                        data={EXPIRY_OPTIONS}
                        allowDeselect={false}
                        {...form.getInputProps('expiresIn')}
                    />
                    <TextInput
                        size="xs"
                        label="User identifier"
                        placeholder="1234"
                        {...form.getInputProps('externalId')}
                    />
                    <TextInput
                        size="xs"
                        label="User email"
                        placeholder="viewer@example.com"
                        {...form.getInputProps('email')}
                    />
                </Group>
                <Accordion multiple variant="contained" chevronSize={16}>
                    <Accordion.Item value="attributes">
                        <Accordion.Control>
                            <Group gap="xs">
                                <Text fz="sm" fw={500}>
                                    User attributes
                                </Text>
                                {attributeCount > 0 && (
                                    <Badge size="sm">{attributeCount}</Badge>
                                )}
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="xs" align="flex-start">
                                {userAttributes.map((item, index) => (
                                    <Group
                                        key={item.uuid}
                                        gap="xs"
                                        wrap="nowrap"
                                        w="100%"
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
                                            color="red"
                                            aria-label="Remove attribute"
                                            onClick={() =>
                                                form.removeListItem(
                                                    'userAttributes',
                                                    index,
                                                )
                                            }
                                        >
                                            <MantineIcon icon={IconTrash} />
                                        </ActionIcon>
                                    </Group>
                                ))}
                                <Button
                                    size="xs"
                                    variant="default"
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() =>
                                        form.insertListItem('userAttributes', {
                                            uuid: uuidv4(),
                                            key: '',
                                            value: '',
                                        })
                                    }
                                >
                                    Add attribute
                                </Button>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                    <Accordion.Item value="permissions">
                        <Accordion.Control>
                            <Group gap="xs">
                                <Text fz="sm" fw={500}>
                                    Interactivity & permissions
                                </Text>
                                {permissionCount > 0 && (
                                    <Badge size="sm">
                                        {permissionCount} on
                                    </Badge>
                                )}
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                {target.type === 'dashboard' && (
                                    <EmbedFiltersInteractivity
                                        dashboardUuid={target.uuid}
                                        interactivityOptions={
                                            values.dashboardFiltersInteractivity
                                        }
                                        onInteractivityOptionsChange={(
                                            options,
                                        ) =>
                                            form.setFieldValue(
                                                'dashboardFiltersInteractivity',
                                                options,
                                            )
                                        }
                                    />
                                )}
                                <SimpleGrid
                                    cols={{ base: 1, sm: 2 }}
                                    spacing="xs"
                                >
                                    {permissionSwitches.map(
                                        ({ field, label }) => (
                                            <Switch
                                                key={field}
                                                size="xs"
                                                label={label}
                                                {...form.getInputProps(field, {
                                                    type: 'checkbox',
                                                })}
                                            />
                                        ),
                                    )}
                                </SimpleGrid>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                    <Accordion.Item value="writeActions">
                        <Accordion.Control>
                            <Group gap="xs">
                                <Text fz="sm" fw={500}>
                                    Write actions
                                </Text>
                                <Badge size="sm" color="violet">
                                    Experimental
                                </Badge>
                                {writeActions !== undefined && (
                                    <Badge size="sm">On</Badge>
                                )}
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="xs">
                                <Text c="dimmed" fz="sm">
                                    Choose which Lightdash actor should power
                                    embedded actions like creating scheduled
                                    deliveries or saving charts.
                                </Text>
                                <EmbedWriteActionsForm
                                    projectUuid={projectUuid}
                                    value={writeActions}
                                    onChange={handleWriteActionsChange}
                                    fixedWriteSpaceUuid={
                                        target.spaceUuid ?? undefined
                                    }
                                    sourceSpacesTarget={
                                        target.type === 'dashboard'
                                            ? 'dashboard'
                                            : undefined
                                    }
                                />
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </MantineModal>
    );
};

export default EmbedCodeModal;

import {
    isGithubMcpServerUrl,
    type AiMcpCredentialScope,
    type AiMcpServer,
    type AiProjectMcpServer,
    type AiMcpServerConnectionStatus,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    Badge,
    Box,
    Button,
    Checkbox,
    Collapse,
    Divider,
    Group,
    Menu,
    MultiSelect,
    Paper,
    PasswordInput,
    SegmentedControl,
    Skeleton,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconBrandGithub,
    IconChevronDown,
    IconChevronRight,
    IconDots,
    IconEye,
    IconHelpCircle,
    IconKey,
    IconPlug,
    IconPlugConnected,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { BetaBadge } from '../../../../components/common/BetaBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import useToaster from '../../../../hooks/toaster/useToaster';
import i18n from '../../../../i18n/i18n';
import { useProjectUpdateAiAgentMutation } from '../hooks/useProjectAiAgents';
import {
    useConnectGithubMcpServerAppMutation,
    useConnectGithubMcpServerMutation,
    useDisconnectMcpOAuthConnectionMutation,
    useGithubMcpAvailability,
    useProjectAiMcpServers,
    useAgentAiMcpServerTools,
    useProjectCreateAiMcpServerMutation,
    useRefreshAiMcpServerToolsMutation,
    useStartMcpOAuthConnectionMutation,
    useUpdateAiMcpServerCredentialMutation,
} from '../hooks/useProjectAiMcpServers';
import {
    estimateEnabledMcpToolDefinitionTokens,
    formatTokenEstimate,
    MCP_TOOL_TOKEN_WARNING_THRESHOLD,
} from '../utils/mcpToolTokenEstimates';
import { AgentSettingsSubsection } from './AgentSettingsSubsection';
import classes from './AiAgentMcpServersInput.module.css';
import { AiAgentMcpServerToolsPanel } from './AiAgentMcpServerToolsPanel';
import { AiMcpServerIcon } from './AiMcpServerIcon';
import { GithubMcpConnectModal } from './GithubMcpConnectModal';
import { ManageMcpServersModal } from './ManageMcpServersModal';
import {
    getMcpAuthTypeLabel,
    getMcpConnectionStatusColor,
    getMcpConnectionStatusLabel,
    getMcpServerIconColor,
} from './mcpServerLabels';
import tokenStyles from './McpToolTokenEstimate.module.css';

const CREATE_NEW_MCP_OPTION_VALUE = '__create_new_mcp__';

const createMcpServerFormSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, {
                error: () =>
                    i18n.t('mcpInput.validation.nameRequired', {
                        ns: 'aiAgent',
                    }),
            }),
        url: z
            .string()
            .trim()
            .url({
                error: () =>
                    i18n.t('mcpInput.validation.invalidUrl', { ns: 'aiAgent' }),
            }),
        authType: z.enum(['none', 'bearer', 'oauth']),
        bearerToken: z.string(),
        clientId: z.string(),
        clientSecret: z.string(),
        allowOAuthCredentialSharing: z.boolean(),
    })
    .superRefine((values, ctx) => {
        if (
            values.authType === 'bearer' &&
            values.bearerToken.trim().length === 0
        ) {
            ctx.addIssue({
                code: 'custom',
                message: i18n.t('mcpInput.validation.bearerRequired', {
                    ns: 'aiAgent',
                }),
                path: ['bearerToken'],
            });
        }
        if (
            values.authType === 'oauth' &&
            values.clientId.trim().length > 0 &&
            values.clientSecret.trim().length === 0
        ) {
            ctx.addIssue({
                code: 'custom',
                message: i18n.t('mcpInput.validation.clientSecretRequired', {
                    ns: 'aiAgent',
                }),
                path: ['clientSecret'],
            });
        }
        if (
            values.authType === 'oauth' &&
            values.clientSecret.trim().length > 0 &&
            values.clientId.trim().length === 0
        ) {
            ctx.addIssue({
                code: 'custom',
                message: i18n.t('mcpInput.validation.clientIdRequired', {
                    ns: 'aiAgent',
                }),
                path: ['clientId'],
            });
        }
        if (
            values.authType === 'oauth' &&
            values.allowOAuthCredentialSharing &&
            (values.clientId.trim().length > 0 ||
                values.clientSecret.trim().length > 0)
        ) {
            ctx.addIssue({
                code: 'custom',
                message: i18n.t('mcpInput.validation.clientCredsPersonalOnly', {
                    ns: 'aiAgent',
                }),
                path: ['clientId'],
            });
        }
    });

const getMcpOAuthSharingPolicyLabel = (
    mcpServer: Pick<AiMcpServer, 'authType' | 'allowOAuthCredentialSharing'>,
) =>
    mcpServer.authType === 'oauth'
        ? mcpServer.allowOAuthCredentialSharing
            ? i18n.t('mcpInput.sharingPolicy.shared', { ns: 'aiAgent' })
            : i18n.t('mcpInput.sharingPolicy.personal', { ns: 'aiAgent' })
        : null;

const getMcpOAuthConnectionSummary = (
    mcpServer: Pick<
        AiMcpServer,
        'authType' | 'connectionStatus' | 'allowOAuthCredentialSharing'
    >,
) => {
    if (mcpServer.authType !== 'oauth') {
        return null;
    }

    switch (mcpServer.connectionStatus) {
        case 'connecting':
            return i18n.t('mcpInput.oauthSummary.connecting', {
                ns: 'aiAgent',
            });
        case 'error':
            return i18n.t('mcpInput.oauthSummary.error', { ns: 'aiAgent' });
        case 'connected':
        case 'not_connected':
        default:
            return mcpServer.allowOAuthCredentialSharing
                ? i18n.t('mcpInput.oauthSummary.sharedOrPersonal', {
                      ns: 'aiAgent',
                  })
                : i18n.t('mcpInput.oauthSummary.personal', { ns: 'aiAgent' });
    }
};

const getMcpOAuthPrimaryActionLabel = (
    mcpServer: Pick<
        AiMcpServer,
        'name' | 'connectionStatus' | 'credentialScope'
    >,
) => {
    switch (mcpServer.connectionStatus) {
        case 'connected':
        case 'error':
            return i18n.t('mcpInput.oauthAction.reauthenticate', {
                ns: 'aiAgent',
            });
        case 'connecting':
            return i18n.t('mcpInput.oauthAction.connecting', { ns: 'aiAgent' });
        case 'not_connected':
        default:
            return i18n.t('mcpInput.oauthAction.signIn', {
                ns: 'aiAgent',
                name: mcpServer.name,
            });
    }
};

const shouldShowMcpOAuthPrimaryAction = (
    mcpServer: Pick<AiMcpServer, 'connectionStatus' | 'credentialScope'>,
) =>
    mcpServer.connectionStatus === 'not_connected' ||
    mcpServer.credentialScope === 'shared';

// Re-testing reconnects to the server and rediscovers tools, so it only makes
// sense once credentials exist. Non-oauth servers always have what they need;
// oauth servers must already be connected (or in an error state worth retrying).
const shouldShowMcpRetestConnection = (
    mcpServer: Pick<AiMcpServer, 'authType'>,
    connectionStatus: AiMcpServerConnectionStatus | null,
) =>
    mcpServer.authType !== 'oauth' ||
    connectionStatus === 'connected' ||
    connectionStatus === 'error';

const CreateMcpServerModal = ({
    opened,
    isLoading,
    onClose,
    onSubmit,
}: {
    opened: boolean;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: (
        values: z.infer<typeof createMcpServerFormSchema>,
    ) => Promise<void> | void;
}) => {
    const { t } = useTranslation('aiAgent');
    const [
        oauthOptionsOpened,
        { toggle: toggleOauthOptions, close: closeOauthOptions },
    ] = useDisclosure(false);
    const form = useForm<z.infer<typeof createMcpServerFormSchema>>({
        initialValues: {
            name: '',
            url: '',
            authType: 'none',
            bearerToken: '',
            clientId: '',
            clientSecret: '',
            allowOAuthCredentialSharing: false,
        },
        validate: zodResolver(createMcpServerFormSchema),
    });

    const handleClose = useCallback(() => {
        form.reset();
        closeOauthOptions();
        onClose();
    }, [closeOauthOptions, form, onClose]);

    const handleSubmit = form.onSubmit(async (values) => {
        await onSubmit(values);
        form.reset();
        closeOauthOptions();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('mcpInput.create.title')}
            icon={IconPlug}
            cancelDisabled={isLoading}
            actions={
                <Button
                    type="submit"
                    form="create-mcp-server-form"
                    loading={isLoading}
                >
                    {form.values.authType === 'oauth'
                        ? form.values.allowOAuthCredentialSharing
                            ? t('mcpInput.create.createAndConnectShared')
                            : t('mcpInput.create.createAndConnect')
                        : t('mcpInput.create.createMcp')}
                </Button>
            }
        >
            <form id="create-mcp-server-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        variant="subtle"
                        label={t('mcpInput.fields.name')}
                        placeholder={t('mcpInput.fields.namePlaceholder')}
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <TextInput
                        variant="subtle"
                        label={t('mcpInput.fields.url')}
                        placeholder="https://example.com/mcp"
                        disabled={isLoading}
                        {...form.getInputProps('url')}
                    />
                    <Box>
                        <Text size="sm" fw={500} mb="xs">
                            {t('mcpInput.fields.authType')}
                        </Text>
                        <SegmentedControl
                            fullWidth
                            data={[
                                {
                                    label: t('mcpInput.authTypes.none'),
                                    value: 'none',
                                },
                                {
                                    label: t('mcpInput.authTypes.bearer'),
                                    value: 'bearer',
                                },
                                {
                                    label: t('mcpInput.authTypes.oauth'),
                                    value: 'oauth',
                                },
                            ]}
                            disabled={isLoading}
                            value={form.values.authType}
                            onChange={(value) =>
                                form.setFieldValue(
                                    'authType',
                                    value as 'none' | 'bearer' | 'oauth',
                                )
                            }
                        />
                    </Box>
                    {form.values.authType === 'oauth' && (
                        <Stack gap="xs">
                            <Text size="sm" c="dimmed">
                                {form.values.allowOAuthCredentialSharing
                                    ? t('mcpInput.create.oauthSharedHelp')
                                    : t('mcpInput.create.oauthPersonalHelp')}
                            </Text>
                            <Box>
                                <Button
                                    type="button"
                                    variant="subtle"
                                    color="gray"
                                    size="compact-sm"
                                    px={0}
                                    disabled={isLoading}
                                    rightSection={
                                        <MantineIcon
                                            icon={
                                                oauthOptionsOpened ||
                                                form.values
                                                    .allowOAuthCredentialSharing
                                                    ? IconChevronDown
                                                    : IconChevronRight
                                            }
                                            size="sm"
                                        />
                                    }
                                    onClick={toggleOauthOptions}
                                >
                                    {t('mcpInput.create.moreOptions')}
                                </Button>
                                <Collapse
                                    expanded={
                                        oauthOptionsOpened ||
                                        form.values.allowOAuthCredentialSharing
                                    }
                                >
                                    <Box pt="xs">
                                        {!form.values
                                            .allowOAuthCredentialSharing && (
                                            <>
                                                <TextInput
                                                    variant="subtle"
                                                    label={t(
                                                        'mcpInput.fields.clientId',
                                                    )}
                                                    placeholder="client_id"
                                                    disabled={isLoading}
                                                    autoComplete="off"
                                                    {...form.getInputProps(
                                                        'clientId',
                                                    )}
                                                />
                                                <PasswordInput
                                                    mt="sm"
                                                    variant="subtle"
                                                    label={t(
                                                        'mcpInput.fields.clientSecret',
                                                    )}
                                                    placeholder="client_secret"
                                                    disabled={isLoading}
                                                    autoComplete="off"
                                                    {...form.getInputProps(
                                                        'clientSecret',
                                                    )}
                                                />
                                            </>
                                        )}
                                        <Checkbox
                                            mt={
                                                form.values
                                                    .allowOAuthCredentialSharing
                                                    ? undefined
                                                    : 'md'
                                            }
                                            label={t(
                                                'mcpInput.create.allowSharing',
                                            )}
                                            description={t(
                                                'mcpInput.create.allowSharingDescription',
                                            )}
                                            disabled={isLoading}
                                            checked={
                                                form.values
                                                    .allowOAuthCredentialSharing
                                            }
                                            onChange={(event) => {
                                                const checked =
                                                    event.currentTarget.checked;
                                                form.setFieldValue(
                                                    'allowOAuthCredentialSharing',
                                                    checked,
                                                );
                                                if (checked) {
                                                    form.setFieldValue(
                                                        'clientId',
                                                        '',
                                                    );
                                                    form.setFieldValue(
                                                        'clientSecret',
                                                        '',
                                                    );
                                                }
                                            }}
                                        />
                                    </Box>
                                </Collapse>
                            </Box>
                        </Stack>
                    )}
                    {form.values.authType === 'oauth' &&
                        form.values.allowOAuthCredentialSharing && (
                            <Alert
                                color="orange"
                                icon={<MantineIcon icon={IconAlertTriangle} />}
                                title={t('mcpInput.sharedAlert.title')}
                            >
                                <Stack gap={4}>
                                    <Text size="sm">
                                        {t('mcpInput.sharedAlert.line1')}
                                    </Text>
                                    <Text size="sm">
                                        {t('mcpInput.sharedAlert.line2')}
                                    </Text>
                                    <Text size="sm">
                                        {t('mcpInput.sharedAlert.line3')}
                                    </Text>
                                    <Text size="sm">
                                        {t('mcpInput.sharedAlert.line4')}
                                    </Text>
                                </Stack>
                            </Alert>
                        )}
                    {form.values.authType === 'bearer' && (
                        <Box>
                            <PasswordInput
                                variant="subtle"
                                placeholder={t(
                                    'mcpInput.fields.tokenPlaceholder',
                                )}
                                disabled={isLoading}
                                autoComplete="off"
                                {...form.getInputProps('bearerToken')}
                            />
                            <Text size="xs" c="dimmed" mt="xs">
                                {t('mcpInput.create.tokenHelp')}
                            </Text>
                        </Box>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};

const updateMcpTokenFormSchema = z.object({
    bearerToken: z
        .string()
        .trim()
        .min(1, {
            error: () =>
                i18n.t('mcpInput.validation.bearerRequired', { ns: 'aiAgent' }),
        }),
});

const UpdateMcpServerTokenModal = ({
    mcpServer,
    isLoading,
    onClose,
    onSubmit,
}: {
    mcpServer: AiMcpServer | null;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: (
        values: z.infer<typeof updateMcpTokenFormSchema>,
    ) => Promise<void> | void;
}) => {
    const { t } = useTranslation('aiAgent');
    const form = useForm<z.infer<typeof updateMcpTokenFormSchema>>({
        initialValues: { bearerToken: '' },
        validate: zodResolver(updateMcpTokenFormSchema),
    });

    const handleClose = useCallback(() => {
        form.reset();
        onClose();
    }, [form, onClose]);

    const handleSubmit = form.onSubmit(async (values) => {
        await onSubmit(values);
        form.reset();
    });

    return (
        <MantineModal
            opened={mcpServer !== null}
            onClose={handleClose}
            title={t('mcpInput.updateToken.title')}
            icon={IconKey}
            cancelDisabled={isLoading}
            actions={
                <Button
                    type="submit"
                    form="update-mcp-token-form"
                    loading={isLoading}
                >
                    {t('mcpInput.updateToken.title')}
                </Button>
            }
        >
            <form id="update-mcp-token-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        variant="subtle"
                        label={t('mcpInput.fields.name')}
                        value={mcpServer?.name ?? ''}
                        disabled
                    />
                    <TextInput
                        variant="subtle"
                        label={t('mcpInput.fields.url')}
                        value={mcpServer?.url ?? ''}
                        disabled
                    />
                    <Box>
                        <PasswordInput
                            variant="subtle"
                            label={t('mcpInput.updateToken.newToken')}
                            placeholder={t('mcpInput.fields.tokenPlaceholder')}
                            disabled={isLoading}
                            autoComplete="off"
                            {...form.getInputProps('bearerToken')}
                        />
                        <Text size="xs" c="dimmed" mt="xs">
                            {t('mcpInput.updateToken.help')}
                        </Text>
                    </Box>
                </Stack>
            </form>
        </MantineModal>
    );
};

const AttachMcpServersModal = ({
    opened,
    isLoading,
    options,
    value,
    onChange,
    onClose,
    onSubmit,
    onManage,
}: {
    opened: boolean;
    isLoading: boolean;
    options: { value: string; label: string }[];
    value: string[];
    onChange: (value: string[]) => void;
    onClose: () => void;
    onSubmit: () => void;
    onManage: () => void;
}) => {
    const { t } = useTranslation('aiAgent');
    const hasAttachableOptions = options.some(
        (option) => option.value !== CREATE_NEW_MCP_OPTION_VALUE,
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('mcpInput.attach.title')}
            icon={IconPlug}
            cancelLabel={false}
            actions={
                <Button
                    onClick={onSubmit}
                    disabled={isLoading || value.length === 0}
                >
                    {t('mcpInput.attach.addSelected')}
                </Button>
            }
        >
            <Stack gap="md">
                <MultiSelect
                    variant="subtle"
                    placeholder={
                        hasAttachableOptions
                            ? t('mcpInput.attach.selectExisting')
                            : t('mcpInput.attach.createNew')
                    }
                    data={options}
                    searchable
                    disabled={isLoading}
                    value={value}
                    onChange={onChange}
                    filter={({ options: filterOptions, search }) => {
                        const normalizedSearch = search.toLowerCase().trim();
                        const createOption = filterOptions.find(
                            (option) =>
                                'value' in option &&
                                option.value === CREATE_NEW_MCP_OPTION_VALUE,
                        );
                        const filteredOptions = filterOptions.filter(
                            (option) =>
                                'value' in option &&
                                option.value !== CREATE_NEW_MCP_OPTION_VALUE &&
                                option.label
                                    .toLowerCase()
                                    .includes(normalizedSearch),
                        );

                        return createOption
                            ? [createOption, ...filteredOptions]
                            : filteredOptions;
                    }}
                />
                {!hasAttachableOptions && (
                    <Text size="sm" c="dimmed">
                        {t('mcpInput.attach.noneAvailable')}
                    </Text>
                )}
                <Anchor
                    size="xs"
                    component="button"
                    type="button"
                    ta="left"
                    w="fit-content"
                    onClick={onManage}
                >
                    {t('mcpInput.attach.manage')}
                </Anchor>
            </Stack>
        </MantineModal>
    );
};

const McpToolPermissionsSummary = ({
    agentUuid,
    isPersistedAttachment,
    isSavingAgent,
    mcpServerName,
    mcpServerUuid,
    onTokenEstimateChange,
    projectUuid,
}: {
    agentUuid?: string;
    isPersistedAttachment: boolean;
    isSavingAgent?: boolean;
    mcpServerName: string;
    mcpServerUuid: string;
    onTokenEstimateChange: (
        mcpServerUuid: string,
        tokenEstimate: number,
    ) => void;
    projectUuid: string;
}) => {
    const { t } = useTranslation('aiAgent');
    const { data } = useAgentAiMcpServerTools(
        projectUuid,
        agentUuid,
        mcpServerUuid,
        {
            enabled: !!agentUuid && isPersistedAttachment && !isSavingAgent,
        },
    );

    const tokenEstimate = useMemo(
        () =>
            data
                ? estimateEnabledMcpToolDefinitionTokens(data, mcpServerName)
                : undefined,
        [data, mcpServerName],
    );

    useEffect(() => {
        if (tokenEstimate !== undefined) {
            onTokenEstimateChange(mcpServerUuid, tokenEstimate);
        }
    }, [mcpServerUuid, onTokenEstimateChange, tokenEstimate]);

    if (
        !agentUuid ||
        !isPersistedAttachment ||
        isSavingAgent ||
        !data ||
        tokenEstimate === undefined
    ) {
        return null;
    }

    const enabledCount = data.filter((tool) => tool.enabled).length;

    const isHighTokenEstimate =
        tokenEstimate >= MCP_TOOL_TOKEN_WARNING_THRESHOLD;

    return (
        <Text size="sm" c="dimmed">
            {t('mcpInput.toolsEnabled', {
                enabled: enabledCount,
                total: data.length,
            })}
            <Text span c="ldGray.4">
                {' '}
                ·{' '}
            </Text>
            <Text
                span
                className={`${tokenStyles.serverTokenValue} ${isHighTokenEstimate ? tokenStyles.serverTokenValueWarning : ''}`}
            >
                {t('mcpInput.tokens', {
                    value: formatTokenEstimate(tokenEstimate),
                })}
            </Text>
        </Text>
    );
};

export const AiAgentMcpServersInput = ({
    agentUuid,
    isSavingAgent = false,
    onPersistedChange,
    persistedMcpServerUuids,
    projectUuid,
    value,
    onChange,
}: {
    agentUuid?: string;
    isSavingAgent?: boolean;
    onPersistedChange?: (value: string[]) => void;
    persistedMcpServerUuids?: string[];
    projectUuid: string;
    value: string[];
    onChange: (value: string[]) => void;
}) => {
    const { t } = useTranslation('aiAgent');
    const [isCreateMcpServerModalOpen, createMcpServerModalHandlers] =
        useDisclosure(false);
    const [isAttachMcpServersModalOpen, attachMcpServersModalHandlers] =
        useDisclosure(false);
    const [isManageMcpServersModalOpen, manageMcpServersModalHandlers] =
        useDisclosure(false);
    const [isGithubConfirmModalOpen, githubConfirmModalHandlers] =
        useDisclosure(false);
    const [isGithubNudgeModalOpen, githubNudgeModalHandlers] =
        useDisclosure(false);
    const [attachSelection, setAttachSelection] = useState<string[]>([]);
    const [expandedMcpServers, setExpandedMcpServers] = useState<string[]>([]);
    const [isPersistingSelection, setIsPersistingSelection] = useState(false);
    const [editingTokenMcpServer, setEditingTokenMcpServer] =
        useState<AiMcpServer | null>(null);
    const [mcpServerTokenEstimates, setMcpServerTokenEstimates] = useState<
        Record<string, number>
    >({});
    const isPersistingSelectionRef = useRef(false);
    const { showToastSuccess } = useToaster();
    const { data: mcpServers, isLoading: isLoadingMcpServers } =
        useProjectAiMcpServers(projectUuid);
    const { mutateAsync: createMcpServer, isLoading: isCreatingMcpServer } =
        useProjectCreateAiMcpServerMutation(projectUuid);
    const {
        mutateAsync: updateMcpServerCredential,
        isLoading: isUpdatingToken,
    } = useUpdateAiMcpServerCredentialMutation(projectUuid);
    const { mutateAsync: updateAgentMcpServers } =
        useProjectUpdateAiAgentMutation(projectUuid, {
            showSuccessToast: false,
        });
    const {
        mutateAsync: startMcpOAuthConnection,
        isLoading: isStartingMcpOAuthConnection,
        variables: startingMcpOAuthConnection,
    } = useStartMcpOAuthConnectionMutation(projectUuid);
    const {
        mutateAsync: disconnectMcpOAuthConnection,
        isLoading: isDisconnectingMcpOAuthConnection,
        variables: disconnectingMcpOAuthConnection,
    } = useDisconnectMcpOAuthConnectionMutation(projectUuid);
    const {
        mutateAsync: refreshMcpServerTools,
        isLoading: isRetestingMcpServerConnection,
        variables: retestingMcpServerConnection,
    } = useRefreshAiMcpServerToolsMutation(projectUuid);
    const { data: githubMcpAvailability } =
        useGithubMcpAvailability(projectUuid);
    const { mutateAsync: connectGithubMcp, isLoading: isConnectingGithubMcp } =
        useConnectGithubMcpServerMutation(projectUuid);
    const {
        mutateAsync: connectGithubMcpApp,
        isLoading: isConnectingGithubMcpApp,
    } = useConnectGithubMcpServerAppMutation(projectUuid);

    // A project-level GitHub MCP server may already exist (e.g. created for
    // another agent, or detached from this one). If so, the one-click flow just
    // re-attaches it rather than creating a duplicate.
    const existingGithubMcpServer = useMemo(
        () =>
            mcpServers?.find((mcpServer) =>
                isGithubMcpServerUrl(mcpServer.url),
            ),
        [mcpServers],
    );
    const isGithubConnectedToAgent =
        !!existingGithubMcpServer &&
        value.includes(existingGithubMcpServer.uuid);

    // One-click GitHub: offered when a connect mode is available and GitHub is
    // not already attached to THIS agent. We gate on agent attachment (not
    // project-level existence) so the button reappears after the server is
    // removed from this agent.
    const githubConnectModes = githubMcpAvailability?.availableModes ?? [];
    const canGithubAppConnect = githubConnectModes.includes('github_app');
    const canGithubPatConnect = githubConnectModes.includes('pat');
    const canOneClickConnectGithub =
        githubConnectModes.length > 0 && !isGithubConnectedToAgent;
    // This settings surface is only reachable by users who can manage the
    // agent, so an empty modes list means the org needs the GitHub App.
    const showGithubAppNudge =
        !!githubMcpAvailability &&
        githubConnectModes.length === 0 &&
        !githubMcpAvailability.hasGithubAppInstallation &&
        !isGithubConnectedToAgent;
    const showGithubConnectButton =
        canOneClickConnectGithub || showGithubAppNudge;

    const selectedMcpServers = useMemo(
        () =>
            value
                .map((uuid) =>
                    mcpServers?.find((mcpServer) => mcpServer.uuid === uuid),
                )
                .filter(
                    (mcpServer): mcpServer is AiProjectMcpServer => !!mcpServer,
                ),
        [value, mcpServers],
    );
    const handleTokenEstimateChange = useCallback(
        (mcpServerUuid: string, tokenEstimate: number) => {
            setMcpServerTokenEstimates((currentEstimates) =>
                currentEstimates[mcpServerUuid] === tokenEstimate
                    ? currentEstimates
                    : {
                          ...currentEstimates,
                          [mcpServerUuid]: tokenEstimate,
                      },
            );
        },
        [],
    );
    const persistedSelectedMcpServers = selectedMcpServers.filter((mcpServer) =>
        persistedMcpServerUuids?.includes(mcpServer.uuid),
    );
    const hasCompleteTokenEstimate = persistedSelectedMcpServers.every(
        (mcpServer) => mcpServerTokenEstimates[mcpServer.uuid] !== undefined,
    );
    const totalTokenEstimate = hasCompleteTokenEstimate
        ? persistedSelectedMcpServers.reduce(
              (total, mcpServer) =>
                  total + (mcpServerTokenEstimates[mcpServer.uuid] ?? 0),
              0,
          )
        : undefined;

    const availableMcpServerOptions = useMemo(
        () => [
            {
                value: CREATE_NEW_MCP_OPTION_VALUE,
                label: t('mcpInput.createNewOption'),
            },
            ...(mcpServers ?? [])
                .filter((mcpServer) => !value.includes(mcpServer.uuid))
                .map((mcpServer) => ({
                    value: mcpServer.uuid,
                    label:
                        mcpServer.authType === 'oauth'
                            ? `${mcpServer.name} (${getMcpAuthTypeLabel(mcpServer.authType)}, ${getMcpConnectionStatusLabel(mcpServer)})`
                            : `${mcpServer.name} (${getMcpAuthTypeLabel(mcpServer.authType)})`,
                })),
        ],
        [mcpServers, value, t],
    );

    const openCreateMcpServerModal = useCallback(() => {
        if (isPersistingSelectionRef.current) {
            return;
        }
        setAttachSelection([]);
        attachMcpServersModalHandlers.close();
        createMcpServerModalHandlers.open();
    }, [attachMcpServersModalHandlers, createMcpServerModalHandlers]);

    const openAttachMcpServersModal = useCallback(() => {
        if (isPersistingSelectionRef.current) {
            return;
        }
        setAttachSelection([]);
        attachMcpServersModalHandlers.open();
    }, [attachMcpServersModalHandlers]);

    const openManageMcpServersModal = useCallback(() => {
        setAttachSelection([]);
        attachMcpServersModalHandlers.close();
        manageMcpServersModalHandlers.open();
    }, [attachMcpServersModalHandlers, manageMcpServersModalHandlers]);

    const handleMcpServerDeleted = useCallback(
        (mcpServerUuid: string) => {
            if (!value.includes(mcpServerUuid)) {
                return;
            }
            const nextValue = value.filter((uuid) => uuid !== mcpServerUuid);
            onChange(nextValue);
            onPersistedChange?.(nextValue);
            setExpandedMcpServers((current) =>
                current.filter((uuid) => uuid !== mcpServerUuid),
            );
        },
        [onChange, onPersistedChange, value],
    );

    const handleAttachSelectionChange = useCallback(
        (nextValue: string[]) => {
            if (nextValue.includes(CREATE_NEW_MCP_OPTION_VALUE)) {
                setAttachSelection(
                    nextValue.filter(
                        (selectedValue) =>
                            selectedValue !== CREATE_NEW_MCP_OPTION_VALUE,
                    ),
                );
                openCreateMcpServerModal();
                return;
            }

            setAttachSelection(nextValue);
        },
        [openCreateMcpServerModal],
    );

    const persistMcpServerSelection = useCallback(
        async (nextValue: string[], previousValue: string[]) => {
            if (isPersistingSelectionRef.current) {
                return false;
            }

            isPersistingSelectionRef.current = true;
            setIsPersistingSelection(true);
            onChange(nextValue);

            try {
                if (!agentUuid) {
                    return true;
                }

                await updateAgentMcpServers({
                    uuid: agentUuid,
                    mcpServerUuids: nextValue,
                });
                onPersistedChange?.(nextValue);
                return true;
            } catch (error) {
                onChange(previousValue);
                throw error;
            } finally {
                isPersistingSelectionRef.current = false;
                setIsPersistingSelection(false);
            }
        },
        [agentUuid, onChange, onPersistedChange, updateAgentMcpServers],
    );

    const handleConnectGithubMcp = useCallback(
        async (
            personalAccessToken: string,
            credentialScope: AiMcpCredentialScope,
        ) => {
            try {
                const server = await connectGithubMcp({
                    personalAccessToken,
                    credentialScope,
                });
                if (!server) {
                    return;
                }
                if (!value.includes(server.uuid)) {
                    await persistMcpServerSelection(
                        [...value, server.uuid],
                        value,
                    );
                }
                githubConfirmModalHandlers.close();
            } catch {}
        },
        [
            connectGithubMcp,
            persistMcpServerSelection,
            value,
            githubConfirmModalHandlers,
        ],
    );

    const handleConnectGithubMcpApp = useCallback(async () => {
        try {
            const server = await connectGithubMcpApp();
            if (!server) {
                return;
            }
            if (!value.includes(server.uuid)) {
                await persistMcpServerSelection([...value, server.uuid], value);
            }
        } catch {
            // Errors surface via the mutation's onError toast.
        }
    }, [connectGithubMcpApp, persistMcpServerSelection, value]);

    const handleGithubConnectClick = useCallback(() => {
        if (canGithubAppConnect) {
            void handleConnectGithubMcpApp();
            return;
        }
        if (canGithubPatConnect) {
            githubConfirmModalHandlers.open();
            return;
        }
        githubNudgeModalHandlers.open();
    }, [
        canGithubAppConnect,
        canGithubPatConnect,
        githubConfirmModalHandlers,
        githubNudgeModalHandlers,
        handleConnectGithubMcpApp,
    ]);

    const githubConnectTooltip = canGithubAppConnect
        ? t('mcpInput.github.tooltipApp')
        : canGithubPatConnect
          ? t('mcpInput.github.tooltipPat')
          : t('mcpInput.github.tooltipNudge');

    const renderGithubConnectButton = (size: 'xs' | 'compact-xs') => (
        <Button
            variant="default"
            size={size}
            leftSection={<MantineIcon icon={IconBrandGithub} />}
            loading={isConnectingGithubMcp || isConnectingGithubMcpApp}
            onClick={handleGithubConnectClick}
        >
            {t('mcpInput.github.connect')}
        </Button>
    );

    const handleAttachMcpServers = useCallback(async () => {
        const nextValue = Array.from(new Set([...value, ...attachSelection]));
        const didPersist = await persistMcpServerSelection(nextValue, value);
        if (!didPersist) {
            return;
        }
        setAttachSelection([]);
        attachMcpServersModalHandlers.close();
    }, [
        attachMcpServersModalHandlers,
        attachSelection,
        persistMcpServerSelection,
        value,
    ]);

    const handleCloseAttachMcpServersModal = useCallback(() => {
        if (isPersistingSelectionRef.current) {
            return;
        }
        setAttachSelection([]);
        attachMcpServersModalHandlers.close();
    }, [attachMcpServersModalHandlers]);

    const handleCreateMcpServer = useCallback(
        async (values: z.infer<typeof createMcpServerFormSchema>) => {
            const popupWindow =
                values.authType === 'oauth'
                    ? window.open('', 'mcp-oauth-popup', 'width=600,height=700')
                    : null;

            let mcpServer: AiMcpServer;
            try {
                mcpServer = await createMcpServer({
                    name: values.name.trim(),
                    url: values.url.trim(),
                    authType: values.authType,
                    allowOAuthCredentialSharing:
                        values.authType === 'oauth'
                            ? values.allowOAuthCredentialSharing
                            : undefined,
                    credentials:
                        values.authType === 'bearer'
                            ? {
                                  bearerToken: values.bearerToken.trim(),
                              }
                            : values.authType === 'oauth' &&
                                values.clientId.trim() &&
                                values.clientSecret.trim()
                              ? {
                                    clientId: values.clientId.trim(),
                                    clientSecret: values.clientSecret.trim(),
                                }
                              : null,
                });
            } catch (error) {
                popupWindow?.close();
                throw error;
            }

            const nextValue = Array.from(new Set([...value, mcpServer.uuid]));
            const didPersist = await persistMcpServerSelection(
                nextValue,
                value,
            );
            if (!didPersist) {
                return;
            }
            setExpandedMcpServers((currentExpandedMcpServers) =>
                currentExpandedMcpServers.includes(mcpServer.uuid)
                    ? currentExpandedMcpServers
                    : [...currentExpandedMcpServers, mcpServer.uuid],
            );
            createMcpServerModalHandlers.close();

            if (values.authType === 'oauth') {
                try {
                    await startMcpOAuthConnection({
                        mcpServerUuid: mcpServer.uuid,
                        credentialScope: values.allowOAuthCredentialSharing
                            ? 'shared'
                            : undefined,
                        popupWindow,
                    });
                } catch {
                    // Server creation already succeeded; the OAuth mutation
                    // shows the error toast, so keep the created MCP attached.
                }
            }
        },
        [
            createMcpServer,
            createMcpServerModalHandlers,
            persistMcpServerSelection,
            startMcpOAuthConnection,
            value,
        ],
    );

    const handleUpdateMcpToken = useCallback(
        async (values: { bearerToken: string }) => {
            if (!editingTokenMcpServer) return;
            try {
                await updateMcpServerCredential({
                    mcpServerUuid: editingTokenMcpServer.uuid,
                    bearerToken: values.bearerToken.trim(),
                });
                setEditingTokenMcpServer(null);
            } catch {
                // The mutation surfaces the failure via an error toast; keep the
                // modal open so the user can correct the token.
            }
        },
        [editingTokenMcpServer, updateMcpServerCredential],
    );

    const handleStartMcpOAuthConnection = useCallback(
        async (mcpServerUuid: string) => {
            await startMcpOAuthConnection({ mcpServerUuid });
        },
        [startMcpOAuthConnection],
    );

    const handleRetestMcpServerConnection = useCallback(
        async (mcpServerUuid: string) => {
            try {
                await refreshMcpServerTools({
                    mcpServerUuid,
                    agentUuid,
                    showSuccessToast: false,
                });
                showToastSuccess({
                    title: t('mcpInput.retestSuccess'),
                });
            } catch {
                // The mutation surfaces the failure via an error toast, and the
                // server's connection status/error is refreshed in the list.
            }
        },
        [agentUuid, refreshMcpServerTools, showToastSuccess, t],
    );

    const handleDisconnectMcpOAuthConnection = useCallback(
        async (mcpServerUuid: string) => {
            await disconnectMcpOAuthConnection({ mcpServerUuid });
        },
        [disconnectMcpOAuthConnection],
    );

    const handleRemoveMcpServer = useCallback(
        async (mcpServerUuid: string) => {
            const nextValue = value.filter(
                (selectedUuid) => selectedUuid !== mcpServerUuid,
            );
            const didPersist = await persistMcpServerSelection(
                nextValue,
                value,
            );
            if (!didPersist) {
                return;
            }
            setExpandedMcpServers((currentExpandedMcpServers) =>
                currentExpandedMcpServers.filter(
                    (expandedMcpServerUuid) =>
                        expandedMcpServerUuid !== mcpServerUuid,
                ),
            );
        },
        [persistMcpServerSelection, value],
    );

    const handleToggleExpandedMcpServer = useCallback(
        (mcpServerUuid: string) => {
            setExpandedMcpServers((currentExpandedMcpServers) =>
                currentExpandedMcpServers.includes(mcpServerUuid)
                    ? currentExpandedMcpServers.filter(
                          (expandedMcpServerUuid) =>
                              expandedMcpServerUuid !== mcpServerUuid,
                      )
                    : [...currentExpandedMcpServers, mcpServerUuid],
            );
        },
        [],
    );

    const handleSetExpandedMcpServer = useCallback(
        (mcpServerUuid: string, expanded: boolean) => {
            setExpandedMcpServers((currentExpandedMcpServers) =>
                expanded
                    ? currentExpandedMcpServers.includes(mcpServerUuid)
                        ? currentExpandedMcpServers
                        : [...currentExpandedMcpServers, mcpServerUuid]
                    : currentExpandedMcpServers.filter(
                          (expandedMcpServerUuid) =>
                              expandedMcpServerUuid !== mcpServerUuid,
                      ),
            );
        },
        [],
    );

    const renderMcpServerActionMenu = useCallback(
        (
            mcpServer: AiMcpServer,
            connectionStatus: AiMcpServerConnectionStatus | null,
            isConnecting: boolean,
            isDisconnecting: boolean,
            isRetesting: boolean,
            isExpanded: boolean,
        ) => {
            return (
                <Menu position="bottom-end" withArrow width={220}>
                    <Menu.Target>
                        <ActionIcon
                            type="button"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            type="button"
                            leftSection={<MantineIcon icon={IconEye} />}
                            onClick={(event) => {
                                event.stopPropagation();
                                handleSetExpandedMcpServer(
                                    mcpServer.uuid,
                                    !isExpanded,
                                );
                            }}
                        >
                            {isExpanded
                                ? t('mcpInput.menu.hideTools')
                                : t('mcpInput.menu.viewTools')}
                        </Menu.Item>
                        {mcpServer.authType === 'bearer' &&
                            (!isGithubMcpServerUrl(mcpServer.url) ||
                                canGithubPatConnect) && (
                                <Menu.Item
                                    type="button"
                                    leftSection={<MantineIcon icon={IconKey} />}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setEditingTokenMcpServer(mcpServer);
                                    }}
                                    disabled={isPersistingSelection}
                                >
                                    {t('mcpInput.updateToken.title')}
                                </Menu.Item>
                            )}
                        {mcpServer.authType === 'oauth' && (
                            <Menu.Item
                                type="button"
                                leftSection={
                                    <MantineIcon
                                        icon={
                                            connectionStatus === 'connected' ||
                                            connectionStatus === 'error'
                                                ? IconRefresh
                                                : IconPlugConnected
                                        }
                                    />
                                }
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void handleStartMcpOAuthConnection(
                                        mcpServer.uuid,
                                    );
                                }}
                                disabled={isConnecting || isPersistingSelection}
                            >
                                {isConnecting
                                    ? t('mcpInput.oauthAction.connecting')
                                    : getMcpOAuthPrimaryActionLabel({
                                          name: mcpServer.name,
                                          connectionStatus,
                                          credentialScope:
                                              mcpServer.credentialScope,
                                      })}
                            </Menu.Item>
                        )}
                        {shouldShowMcpRetestConnection(
                            mcpServer,
                            connectionStatus,
                        ) && (
                            <Menu.Item
                                type="button"
                                leftSection={
                                    <MantineIcon icon={IconPlugConnected} />
                                }
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRetestMcpServerConnection(
                                        mcpServer.uuid,
                                    );
                                }}
                                disabled={
                                    isRetesting ||
                                    isConnecting ||
                                    isPersistingSelection
                                }
                            >
                                {isRetesting
                                    ? t('mcpInput.menu.testing')
                                    : t('mcpInput.menu.testConnection')}
                            </Menu.Item>
                        )}
                        {mcpServer.hasCredentials &&
                            mcpServer.credentialScope === 'user' && (
                                <Menu.Item
                                    type="button"
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void handleDisconnectMcpOAuthConnection(
                                            mcpServer.uuid,
                                        );
                                    }}
                                    disabled={
                                        isDisconnecting || isPersistingSelection
                                    }
                                >
                                    {isDisconnecting
                                        ? t('mcpInput.menu.disconnecting')
                                        : mcpServer.authType === 'bearer'
                                          ? t('mcpInput.menu.disconnectToken')
                                          : t(
                                                'mcpInput.menu.disconnectAccount',
                                            )}
                                </Menu.Item>
                            )}
                        <Menu.Item
                            type="button"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={(event) => {
                                event.stopPropagation();
                                void handleRemoveMcpServer(mcpServer.uuid);
                            }}
                            disabled={isPersistingSelection}
                            color="red"
                        >
                            {t('actions.remove', { ns: 'common' })}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            );
        },
        [
            t,
            canGithubPatConnect,
            handleDisconnectMcpOAuthConnection,
            handleRemoveMcpServer,
            handleRetestMcpServerConnection,
            handleSetExpandedMcpServer,
            handleStartMcpOAuthConnection,
            isPersistingSelection,
            setEditingTokenMcpServer,
        ],
    );

    return (
        <>
            <AgentSettingsSubsection
                title={t('mcpInput.section.title')}
                description={t('mcpInput.section.description')}
                badge={<BetaBadge />}
                action={
                    selectedMcpServers.length > 0 && (
                        <Group align="center" gap="sm" wrap="wrap">
                            {persistedSelectedMcpServers.length > 0 && (
                                <Group gap={4} wrap="nowrap">
                                    {totalTokenEstimate === undefined ? (
                                        <Skeleton w={88} h={18} radius="xl" />
                                    ) : (
                                        <Text
                                            className={
                                                tokenStyles.totalTokenValue
                                            }
                                        >
                                            {t('mcpInput.tokens', {
                                                value: formatTokenEstimate(
                                                    totalTokenEstimate,
                                                ),
                                            })}
                                        </Text>
                                    )}
                                    <Tooltip
                                        w={320}
                                        label={t('mcpInput.section.tokensHelp')}
                                    >
                                        <ActionIcon
                                            type="button"
                                            color="ldGray"
                                            size="xs"
                                            aria-label={t(
                                                'mcpInput.section.tokensHelpAria',
                                            )}
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                                size="sm"
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            )}
                            {showGithubConnectButton && (
                                <Tooltip w={260} label={githubConnectTooltip}>
                                    {renderGithubConnectButton('compact-xs')}
                                </Tooltip>
                            )}
                            <Button
                                variant="default"
                                size="compact-xs"
                                onClick={openManageMcpServersModal}
                                disabled={isPersistingSelection}
                            >
                                {t('mcpInput.section.manage')}
                            </Button>
                            <Button
                                variant="default"
                                size="compact-xs"
                                onClick={openAttachMcpServersModal}
                                disabled={isPersistingSelection}
                            >
                                {t('mcpInput.section.add')}
                            </Button>
                        </Group>
                    )
                }
            >
                <Stack gap="sm">
                    {selectedMcpServers.length === 0 && (
                        <Paper variant="dotted" py="xl">
                            <Stack align="center" gap="xs">
                                <Text size="sm" c="dimmed">
                                    {t('mcpInput.section.empty')}
                                </Text>
                                <Group gap="xs">
                                    {showGithubConnectButton &&
                                        renderGithubConnectButton('xs')}
                                    <Button
                                        variant="default"
                                        size="xs"
                                        disabled={
                                            isLoadingMcpServers ||
                                            isPersistingSelection
                                        }
                                        onClick={openManageMcpServersModal}
                                    >
                                        {t('mcpInput.section.manage')}
                                    </Button>
                                    <Button
                                        variant="default"
                                        size="xs"
                                        disabled={
                                            isLoadingMcpServers ||
                                            isPersistingSelection
                                        }
                                        onClick={openAttachMcpServersModal}
                                    >
                                        {t('mcpInput.section.add')}
                                    </Button>
                                </Group>
                            </Stack>
                        </Paper>
                    )}
                    {selectedMcpServers.length > 0 && (
                        <Stack gap="sm">
                            {selectedMcpServers.map((mcpServer) => {
                                const isConnecting =
                                    mcpServer.authType === 'oauth' &&
                                    isStartingMcpOAuthConnection &&
                                    startingMcpOAuthConnection?.mcpServerUuid ===
                                        mcpServer.uuid;
                                const isDisconnecting =
                                    mcpServer.authType === 'oauth' &&
                                    isDisconnectingMcpOAuthConnection &&
                                    disconnectingMcpOAuthConnection?.mcpServerUuid ===
                                        mcpServer.uuid;
                                const isRetesting =
                                    isRetestingMcpServerConnection &&
                                    retestingMcpServerConnection?.mcpServerUuid ===
                                        mcpServer.uuid;
                                const connectionStatus = isConnecting
                                    ? 'connecting'
                                    : mcpServer.connectionStatus;
                                const isExpanded = expandedMcpServers.includes(
                                    mcpServer.uuid,
                                );
                                const isPersistedAttachment =
                                    persistedMcpServerUuids?.includes(
                                        mcpServer.uuid,
                                    ) ?? false;
                                const sharingPolicyLabel =
                                    getMcpOAuthSharingPolicyLabel({
                                        authType: mcpServer.authType,
                                        allowOAuthCredentialSharing:
                                            mcpServer.allowOAuthCredentialSharing,
                                    });

                                return (
                                    <Paper
                                        key={mcpServer.uuid}
                                        radius="md"
                                        p={0}
                                        className={classes.serverCard}
                                    >
                                        <Group
                                            justify="space-between"
                                            align="flex-start"
                                            gap="md"
                                            px="md"
                                            py="md"
                                        >
                                            <Group gap="sm" align="flex-start">
                                                <AiMcpServerIcon
                                                    color={getMcpServerIconColor(
                                                        connectionStatus,
                                                    )}
                                                    name={mcpServer.name}
                                                    size={40}
                                                    src={mcpServer.iconUrl}
                                                />
                                                <Stack gap={2}>
                                                    <Text fw={600}>
                                                        {mcpServer.name}
                                                    </Text>
                                                    <Text size="sm" c="dimmed">
                                                        {mcpServer.url}
                                                    </Text>
                                                    {mcpServer.authType ===
                                                        'oauth' && (
                                                        <Text
                                                            size="sm"
                                                            c="dimmed"
                                                        >
                                                            {getMcpOAuthConnectionSummary(
                                                                {
                                                                    authType:
                                                                        mcpServer.authType,
                                                                    connectionStatus,
                                                                    allowOAuthCredentialSharing:
                                                                        mcpServer.allowOAuthCredentialSharing,
                                                                },
                                                            )}
                                                        </Text>
                                                    )}
                                                    <Text
                                                        size="sm"
                                                        c="dimmed"
                                                        fw={500}
                                                    >
                                                        {getMcpAuthTypeLabel(
                                                            mcpServer.authType,
                                                        )}
                                                        {sharingPolicyLabel
                                                            ? ` · ${sharingPolicyLabel}`
                                                            : null}
                                                    </Text>
                                                    {mcpServer.error && (
                                                        <Text
                                                            size="xs"
                                                            c="red.7"
                                                        >
                                                            {mcpServer.error}
                                                        </Text>
                                                    )}
                                                </Stack>
                                            </Group>
                                            <Group
                                                gap="xs"
                                                align="center"
                                                wrap="nowrap"
                                            >
                                                <Badge
                                                    color={getMcpConnectionStatusColor(
                                                        connectionStatus,
                                                    )}
                                                >
                                                    {getMcpConnectionStatusLabel(
                                                        {
                                                            authType:
                                                                mcpServer.authType,
                                                            connectionStatus,
                                                        },
                                                    )}
                                                </Badge>
                                                {connectionStatus ===
                                                    'connected' &&
                                                    shouldShowMcpRetestConnection(
                                                        mcpServer,
                                                        connectionStatus,
                                                    ) && (
                                                        <Tooltip
                                                            label={t(
                                                                'mcpInput.menu.testConnection',
                                                            )}
                                                        >
                                                            <ActionIcon
                                                                type="button"
                                                                size="sm"
                                                                loading={
                                                                    isRetesting
                                                                }
                                                                disabled={
                                                                    isRetesting ||
                                                                    isPersistingSelection
                                                                }
                                                                onClick={(
                                                                    event,
                                                                ) => {
                                                                    event.stopPropagation();
                                                                    void handleRetestMcpServerConnection(
                                                                        mcpServer.uuid,
                                                                    );
                                                                }}
                                                            >
                                                                <MantineIcon
                                                                    icon={
                                                                        IconRefresh
                                                                    }
                                                                />
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    )}
                                                {mcpServer.authType ===
                                                    'oauth' &&
                                                    shouldShowMcpOAuthPrimaryAction(
                                                        {
                                                            connectionStatus,
                                                            credentialScope:
                                                                mcpServer.credentialScope,
                                                        },
                                                    ) && (
                                                        <Button
                                                            variant="default"
                                                            size="compact-xs"
                                                            onClick={() =>
                                                                void handleStartMcpOAuthConnection(
                                                                    mcpServer.uuid,
                                                                )
                                                            }
                                                            loading={
                                                                isConnecting
                                                            }
                                                        >
                                                            {getMcpOAuthPrimaryActionLabel(
                                                                {
                                                                    name: mcpServer.name,
                                                                    connectionStatus,
                                                                    credentialScope:
                                                                        mcpServer.credentialScope,
                                                                },
                                                            )}
                                                        </Button>
                                                    )}
                                                {renderMcpServerActionMenu(
                                                    mcpServer,
                                                    connectionStatus,
                                                    isConnecting,
                                                    isDisconnecting,
                                                    isRetesting,
                                                    isExpanded,
                                                )}
                                            </Group>
                                        </Group>
                                        <Divider />
                                        <Box
                                            component="button"
                                            type="button"
                                            onClick={() =>
                                                handleToggleExpandedMcpServer(
                                                    mcpServer.uuid,
                                                )
                                            }
                                            px="md"
                                            py="sm"
                                            style={{
                                                width: '100%',
                                                background: 'transparent',
                                                border: 0,
                                                cursor: 'pointer',
                                                font: 'inherit',
                                                color: 'inherit',
                                                textAlign: 'inherit',
                                            }}
                                        >
                                            <Group
                                                justify="space-between"
                                                gap="sm"
                                            >
                                                <Group gap="xs" wrap="nowrap">
                                                    <MantineIcon
                                                        icon={
                                                            isExpanded
                                                                ? IconChevronDown
                                                                : IconChevronRight
                                                        }
                                                        color="var(--mantine-color-dimmed)"
                                                        size="sm"
                                                    />
                                                    <Text size="sm" fw={500}>
                                                        {t(
                                                            'mcpInput.toolPermissions',
                                                        )}
                                                    </Text>
                                                    <McpToolPermissionsSummary
                                                        agentUuid={agentUuid}
                                                        isPersistedAttachment={
                                                            isPersistedAttachment
                                                        }
                                                        isSavingAgent={
                                                            isSavingAgent
                                                        }
                                                        mcpServerUuid={
                                                            mcpServer.uuid
                                                        }
                                                        mcpServerName={
                                                            mcpServer.name
                                                        }
                                                        onTokenEstimateChange={
                                                            handleTokenEstimateChange
                                                        }
                                                        projectUuid={
                                                            projectUuid
                                                        }
                                                    />
                                                </Group>
                                                <Text size="sm" c="dimmed">
                                                    {isExpanded
                                                        ? t('mcpInput.hide')
                                                        : t('mcpInput.view')}
                                                </Text>
                                            </Group>
                                        </Box>
                                        <Collapse expanded={isExpanded}>
                                            <Divider />
                                            <Box px="md" py="sm">
                                                <AiAgentMcpServerToolsPanel
                                                    agentUuid={agentUuid}
                                                    isSavingAgent={
                                                        isSavingAgent
                                                    }
                                                    opened={isExpanded}
                                                    projectUuid={projectUuid}
                                                    mcpServer={mcpServer}
                                                    isPersistedAttachment={
                                                        isPersistedAttachment
                                                    }
                                                    showHeader={false}
                                                />
                                            </Box>
                                        </Collapse>
                                    </Paper>
                                );
                            })}
                        </Stack>
                    )}
                </Stack>
            </AgentSettingsSubsection>
            <CreateMcpServerModal
                opened={isCreateMcpServerModalOpen}
                onClose={createMcpServerModalHandlers.close}
                onSubmit={handleCreateMcpServer}
                isLoading={isCreatingMcpServer || isPersistingSelection}
            />
            <UpdateMcpServerTokenModal
                mcpServer={editingTokenMcpServer}
                isLoading={isUpdatingToken}
                onClose={() => setEditingTokenMcpServer(null)}
                onSubmit={handleUpdateMcpToken}
            />
            <AttachMcpServersModal
                opened={isAttachMcpServersModalOpen}
                onClose={handleCloseAttachMcpServersModal}
                onSubmit={handleAttachMcpServers}
                isLoading={isLoadingMcpServers || isPersistingSelection}
                options={availableMcpServerOptions}
                value={attachSelection}
                onChange={handleAttachSelectionChange}
                onManage={openManageMcpServersModal}
            />
            <ManageMcpServersModal
                opened={isManageMcpServersModalOpen}
                onClose={manageMcpServersModalHandlers.close}
                projectUuid={projectUuid}
                onDeleted={handleMcpServerDeleted}
            />
            <GithubMcpConnectModal
                opened={isGithubConfirmModalOpen}
                onClose={githubConfirmModalHandlers.close}
                isLoading={isConnectingGithubMcp || isPersistingSelection}
                canChooseScope
                onConnect={handleConnectGithubMcp}
            />
            <MantineModal
                opened={isGithubNudgeModalOpen}
                onClose={githubNudgeModalHandlers.close}
                title={t('mcpInput.github.connect')}
                icon={IconBrandGithub}
            >
                <Stack gap="md">
                    <Text size="sm">{t('mcpInput.github.nudgeIntro')}</Text>
                    <Text size="sm">
                        <Trans
                            t={t}
                            i18nKey="mcpInput.github.nudgeInstall"
                            components={{
                                anchor: (
                                    <Anchor
                                        href="/generalSettings/integrations"
                                        target="_blank"
                                    />
                                ),
                            }}
                        />
                    </Text>
                </Stack>
            </MantineModal>
        </>
    );
};

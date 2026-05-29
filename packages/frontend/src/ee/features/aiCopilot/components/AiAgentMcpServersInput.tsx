import {
    GITHUB_MCP_SERVER_URL,
    type AiMcpServer,
    type AiMcpServerAuthType,
    type AiMcpServerConnectionStatus,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Center,
    Checkbox,
    Collapse,
    Divider,
    Group,
    Menu,
    MultiSelect,
    Paper,
    PasswordInput,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconBrandGithub,
    IconChevronDown,
    IconChevronRight,
    IconDots,
    IconEye,
    IconPlug,
    IconPlugConnected,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { BetaBadge } from '../../../../components/common/BetaBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { useProjectUpdateAiAgentMutation } from '../hooks/useProjectAiAgents';
import {
    useConnectGithubMcpServerMutation,
    useDisconnectMcpOAuthConnectionMutation,
    useGithubMcpAvailability,
    useProjectAiMcpServers,
    useAgentAiMcpServerTools,
    useProjectCreateAiMcpServerMutation,
    useStartMcpOAuthConnectionMutation,
} from '../hooks/useProjectAiMcpServers';
import { AiAgentMcpServerToolsPanel } from './AiAgentMcpServerToolsPanel';
import { AiMcpServerIcon } from './AiMcpServerIcon';

const CREATE_NEW_MCP_OPTION_VALUE = '__create_new_mcp__';

const createMcpServerFormSchema = z
    .object({
        name: z.string().trim().min(1, 'Name is required'),
        url: z.string().trim().url('Enter a valid URL'),
        authType: z.enum(['none', 'bearer', 'oauth']),
        bearerToken: z.string(),
        allowOAuthCredentialSharing: z.boolean(),
    })
    .superRefine((values, ctx) => {
        if (
            values.authType === 'bearer' &&
            values.bearerToken.trim().length === 0
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Bearer token is required',
                path: ['bearerToken'],
            });
        }
    });

const getMcpAuthTypeLabel = (authType: AiMcpServerAuthType) => {
    switch (authType) {
        case 'oauth':
            return 'OAuth';
        case 'bearer':
            return 'Bearer';
        default:
            return 'No auth';
    }
};

const getMcpConnectionStatusLabel = (
    mcpServer: Pick<AiMcpServer, 'authType' | 'connectionStatus'>,
) => {
    switch (mcpServer.connectionStatus) {
        case 'connected':
            return 'Connected';
        case 'connecting':
            return 'Connecting';
        case 'error':
            return 'Reconnect required';
        case 'not_connected':
        default:
            return 'Not connected';
    }
};

const getMcpConnectionStatusColor = (
    connectionStatus: AiMcpServerConnectionStatus | null,
) => {
    switch (connectionStatus) {
        case 'connected':
            return 'green';
        case 'connecting':
            return 'blue';
        case 'error':
            return 'red';
        case 'not_connected':
        default:
            return 'gray';
    }
};

const getMcpOAuthSharingPolicyLabel = (
    mcpServer: Pick<AiMcpServer, 'authType' | 'allowOAuthCredentialSharing'>,
) =>
    mcpServer.authType === 'oauth'
        ? mcpServer.allowOAuthCredentialSharing
            ? 'Shared sign-in allowed'
            : 'Personal sign-in only'
        : null;

const getMcpOAuthSharingPolicyTooltip = (
    mcpServer: Pick<AiMcpServer, 'authType' | 'allowOAuthCredentialSharing'>,
) =>
    mcpServer.authType === 'oauth'
        ? mcpServer.allowOAuthCredentialSharing
            ? 'This MCP can use a shared project sign-in or each person can sign in with their own account.'
            : 'This MCP only supports personal sign-in. Each person must connect their own account.'
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
        case 'connected':
            return mcpServer.allowOAuthCredentialSharing
                ? 'Can use a shared project account or a personal sign-in.'
                : 'Each person signs in with their own account.';
        case 'connecting':
            return 'Waiting for OAuth to complete.';
        case 'error':
            return 'Your connection needs attention before tools can run.';
        case 'not_connected':
        default:
            return mcpServer.allowOAuthCredentialSharing
                ? 'Can use a shared project account or a personal sign-in.'
                : 'Each person signs in with their own account.';
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
            return `Sign in to ${mcpServer.name}`;
        case 'error':
            return `Sign in to ${mcpServer.name}`;
        case 'connecting':
            return 'Connecting...';
        case 'not_connected':
        default:
            return `Sign in to ${mcpServer.name}`;
    }
};

const shouldShowMcpOAuthPrimaryAction = (
    mcpServer: Pick<AiMcpServer, 'connectionStatus' | 'credentialScope'>,
) =>
    mcpServer.connectionStatus === 'not_connected' ||
    mcpServer.credentialScope === 'shared';

const getMcpServerIconColor = (
    connectionStatus: AiMcpServerConnectionStatus | null,
) => {
    switch (connectionStatus) {
        case 'connected':
            return 'green';
        case 'connecting':
            return 'blue';
        case 'error':
            return 'red';
        case 'not_connected':
        default:
            return 'gray';
    }
};

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
            title="Create MCP server"
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
                            ? 'Create and connect shared'
                            : 'Create and connect'
                        : 'Create MCP'}
                </Button>
            }
        >
            <form id="create-mcp-server-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        variant="subtle"
                        label="Name"
                        placeholder="Docs MCP"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <TextInput
                        variant="subtle"
                        label="URL"
                        placeholder="https://example.com/mcp"
                        disabled={isLoading}
                        {...form.getInputProps('url')}
                    />
                    <Box>
                        <Text size="sm" fw={500} mb="xs">
                            Auth type
                        </Text>
                        <SegmentedControl
                            fullWidth
                            data={[
                                { label: 'No auth', value: 'none' },
                                { label: 'Bearer token', value: 'bearer' },
                                { label: 'OAuth', value: 'oauth' },
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
                                    ? 'This MCP can use a shared project account or personal sign-ins.'
                                    : 'Each person who uses this agent will be asked to connect their own account the first time they use this agent.'}
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
                                    More options
                                </Button>
                                <Collapse
                                    in={
                                        oauthOptionsOpened ||
                                        form.values.allowOAuthCredentialSharing
                                    }
                                >
                                    <Box pt="xs">
                                        <Checkbox
                                            label="Allow shared project credentials for this MCP"
                                            description="Optional. Agent managers can connect a shared project account for this MCP."
                                            disabled={isLoading}
                                            {...form.getInputProps(
                                                'allowOAuthCredentialSharing',
                                                {
                                                    type: 'checkbox',
                                                },
                                            )}
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
                                variant="light"
                                icon={<MantineIcon icon={IconAlertTriangle} />}
                                title="Shared OAuth connection"
                            >
                                <Stack gap={4}>
                                    <Text size="sm">
                                        Agent manager can connect one shared
                                        project account for this MCP.
                                    </Text>
                                    <Text size="sm">
                                        Create and connect shared will connect
                                        that shared project account now.
                                    </Text>
                                    <Text size="sm">
                                        Anyone who can run an agent attached to
                                        this MCP may use that shared account.
                                    </Text>
                                    <Text size="sm">
                                        Actions on the remote system may appear
                                        as the connected shared account.
                                    </Text>
                                </Stack>
                            </Alert>
                        )}
                    {form.values.authType === 'bearer' && (
                        <Box>
                            <PasswordInput
                                variant="subtle"
                                placeholder="API key or personal access token"
                                disabled={isLoading}
                                autoComplete="off"
                                {...form.getInputProps('bearerToken')}
                            />
                            <Text size="xs" c="dimmed" mt="xs">
                                The token will be encrypted and stored securely.
                                This credential will be shared across all users
                                of the agent.
                            </Text>
                        </Box>
                    )}
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
}: {
    opened: boolean;
    isLoading: boolean;
    options: { value: string; label: string }[];
    value: string[];
    onChange: (value: string[]) => void;
    onClose: () => void;
    onSubmit: () => void;
}) => {
    const hasAttachableOptions = options.some(
        (option) => option.value !== CREATE_NEW_MCP_OPTION_VALUE,
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Add MCP"
            icon={IconPlug}
            cancelLabel={false}
            actions={
                <Button
                    onClick={onSubmit}
                    disabled={isLoading || value.length === 0}
                >
                    Add selected
                </Button>
            }
        >
            <Stack gap="md">
                <MultiSelect
                    variant="subtle"
                    placeholder={
                        hasAttachableOptions
                            ? 'Select existing MCP servers'
                            : 'Create a new MCP server'
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
                        No existing MCP servers available yet.
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

const McpToolPermissionsSummary = ({
    agentUuid,
    isPersistedAttachment,
    isSavingAgent,
    mcpServerUuid,
    projectUuid,
}: {
    agentUuid?: string;
    isPersistedAttachment: boolean;
    isSavingAgent?: boolean;
    mcpServerUuid: string;
    projectUuid: string;
}) => {
    const { data } = useAgentAiMcpServerTools(
        projectUuid,
        agentUuid,
        mcpServerUuid,
        {
            enabled: !!agentUuid && isPersistedAttachment && !isSavingAgent,
        },
    );

    if (!agentUuid || !isPersistedAttachment || isSavingAgent || !data) {
        return null;
    }

    const enabledCount = data.filter((tool) => tool.enabled).length;

    return (
        <Text size="sm" c="dimmed">
            {enabledCount}/{data.length} enabled
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
    const [isCreateMcpServerModalOpen, createMcpServerModalHandlers] =
        useDisclosure(false);
    const [isAttachMcpServersModalOpen, attachMcpServersModalHandlers] =
        useDisclosure(false);
    const [attachSelection, setAttachSelection] = useState<string[]>([]);
    const [expandedMcpServers, setExpandedMcpServers] = useState<string[]>([]);
    const [isPersistingSelection, setIsPersistingSelection] = useState(false);
    const isPersistingSelectionRef = useRef(false);
    const { data: mcpServers, isLoading: isLoadingMcpServers } =
        useProjectAiMcpServers(projectUuid);
    const { mutateAsync: createMcpServer, isLoading: isCreatingMcpServer } =
        useProjectCreateAiMcpServerMutation(projectUuid);
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
    const { data: githubMcpAvailability } =
        useGithubMcpAvailability(projectUuid);
    const { mutateAsync: connectGithubMcp, isLoading: isConnectingGithubMcp } =
        useConnectGithubMcpServerMutation(projectUuid);

    // A project-level GitHub MCP server may already exist (e.g. created for
    // another agent, or detached from this one). If so, the one-click flow just
    // re-attaches it rather than creating a duplicate.
    const existingGithubMcpServer = useMemo(
        () =>
            mcpServers?.find(
                (mcpServer) => mcpServer.url === GITHUB_MCP_SERVER_URL,
            ),
        [mcpServers],
    );
    const isGithubConnectedToAgent =
        !!existingGithubMcpServer &&
        value.includes(existingGithubMcpServer.uuid);

    // One-click GitHub: offered when the org has a GitHub integration the user
    // can manage and GitHub is not already attached to THIS agent. We gate on
    // agent attachment (not project-level existence) so the button reappears
    // after the server is removed from this agent.
    const canOneClickConnectGithub =
        githubMcpAvailability?.available === true && !isGithubConnectedToAgent;

    const selectedMcpServers = useMemo(
        () =>
            value
                .map((uuid) =>
                    mcpServers?.find((mcpServer) => mcpServer.uuid === uuid),
                )
                .filter((mcpServer): mcpServer is AiMcpServer => !!mcpServer),
        [value, mcpServers],
    );

    const availableMcpServerOptions = useMemo(
        () => [
            {
                value: CREATE_NEW_MCP_OPTION_VALUE,
                label: '+ Create new MCP',
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
        [mcpServers, value],
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

    const handleConnectGithubMcp = useCallback(async () => {
        // Reuse the existing project-level server when present; otherwise mint
        // the installation token and create it.
        const server = existingGithubMcpServer ?? (await connectGithubMcp());
        // Persist the attachment (not just local form state) so the agent's
        // tool-permissions panel can load/save immediately, matching "+ Add".
        if (server && !value.includes(server.uuid)) {
            await persistMcpServerSelection([...value, server.uuid], value);
        }
    }, [
        existingGithubMcpServer,
        connectGithubMcp,
        persistMcpServerSelection,
        value,
    ]);

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

    const handleStartMcpOAuthConnection = useCallback(
        async (mcpServerUuid: string) => {
            await startMcpOAuthConnection({ mcpServerUuid });
        },
        [startMcpOAuthConnection],
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
            isExpanded: boolean,
        ) => {
            return (
                <Menu
                    position="bottom-end"
                    withArrow
                    withinPortal
                    shadow="md"
                    width={220}
                >
                    <Menu.Target>
                        <ActionIcon
                            type="button"
                            variant="subtle"
                            color="gray"
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
                            {isExpanded ? 'Hide tools' : 'View tools'}
                        </Menu.Item>
                        {mcpServer.authType === 'oauth' && (
                            <Menu.Item
                                type="button"
                                leftSection={
                                    <MantineIcon
                                        icon={
                                            connectionStatus === 'connected'
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
                                    ? 'Connecting...'
                                    : getMcpOAuthPrimaryActionLabel({
                                          name: mcpServer.name,
                                          connectionStatus,
                                          credentialScope:
                                              mcpServer.credentialScope,
                                      })}
                            </Menu.Item>
                        )}
                        {mcpServer.authType === 'oauth' &&
                            mcpServer.hasCredentials &&
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
                                        isConnecting ||
                                        isDisconnecting ||
                                        isPersistingSelection
                                    }
                                >
                                    {isDisconnecting
                                        ? 'Disconnecting...'
                                        : 'Disconnect your account'}
                                </Menu.Item>
                            )}
                        <Menu.Item
                            type="button"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={(event) => {
                                event.stopPropagation();
                                void handleRemoveMcpServer(mcpServer.uuid);
                            }}
                            disabled={isConnecting || isPersistingSelection}
                            color="red"
                        >
                            Remove
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            );
        },
        [
            handleDisconnectMcpOAuthConnection,
            handleRemoveMcpServer,
            handleSetExpandedMcpServer,
            handleStartMcpOAuthConnection,
            isPersistingSelection,
        ],
    );

    return (
        <>
            <Paper p="xl">
                <Group align="center" gap="xs" mb="md">
                    <Group align="center" gap="xs">
                        <Paper p="xxs" withBorder radius="sm">
                            <MantineIcon icon={IconPlug} size="md" />
                        </Paper>
                        <Title order={5} c="ldGray.9" fw={700}>
                            MCP servers
                        </Title>
                        <BetaBadge />
                    </Group>
                    {selectedMcpServers.length > 0 && (
                        <Group align="center" gap="xs">
                            {canOneClickConnectGithub && (
                                <Tooltip
                                    withinPortal
                                    multiline
                                    w={260}
                                    label="Connect the GitHub MCP using your organization's existing GitHub integration — no extra sign-in needed."
                                >
                                    <Button
                                        variant="default"
                                        size="compact-xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconBrandGithub}
                                            />
                                        }
                                        loading={isConnectingGithubMcp}
                                        onClick={handleConnectGithubMcp}
                                    >
                                        Connect GitHub
                                    </Button>
                                </Tooltip>
                            )}
                            <Button
                                variant="default"
                                size="compact-xs"
                                onClick={openAttachMcpServersModal}
                                disabled={isPersistingSelection}
                            >
                                + Add
                            </Button>
                        </Group>
                    )}
                </Group>
                <Stack gap="sm">
                    {selectedMcpServers.length === 0 && (
                        <Center
                            py="xl"
                            style={{
                                border: '1px dashed var(--mantine-color-ldGray-4)',
                                borderRadius: 'var(--mantine-radius-md)',
                            }}
                        >
                            <Stack align="center" gap="xs">
                                <Text size="sm" c="dimmed">
                                    No MCP servers attached
                                </Text>
                                <Group gap="xs">
                                    {canOneClickConnectGithub && (
                                        <Button
                                            variant="default"
                                            size="xs"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconBrandGithub}
                                                />
                                            }
                                            loading={isConnectingGithubMcp}
                                            onClick={handleConnectGithubMcp}
                                        >
                                            Connect GitHub
                                        </Button>
                                    )}
                                    <Button
                                        variant="default"
                                        size="xs"
                                        disabled={
                                            isLoadingMcpServers ||
                                            isPersistingSelection
                                        }
                                        onClick={openAttachMcpServersModal}
                                    >
                                        + Add
                                    </Button>
                                </Group>
                            </Stack>
                        </Center>
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
                                const sharingPolicyTooltip =
                                    getMcpOAuthSharingPolicyTooltip({
                                        authType: mcpServer.authType,
                                        allowOAuthCredentialSharing:
                                            mcpServer.allowOAuthCredentialSharing,
                                    });

                                return (
                                    <Paper
                                        key={mcpServer.uuid}
                                        withBorder
                                        radius="md"
                                        p={0}
                                        style={{ overflow: 'hidden' }}
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
                                                    variant="default"
                                                    color="gray"
                                                >
                                                    {getMcpAuthTypeLabel(
                                                        mcpServer.authType,
                                                    )}
                                                </Badge>
                                                <Badge
                                                    variant="light"
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
                                                {sharingPolicyLabel && (
                                                    <Tooltip
                                                        label={
                                                            sharingPolicyTooltip
                                                        }
                                                        withArrow
                                                        withinPortal
                                                    >
                                                        <Badge
                                                            variant="default"
                                                            color="gray"
                                                        >
                                                            {sharingPolicyLabel}
                                                        </Badge>
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
                                                        Tool permissions
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
                                                        projectUuid={
                                                            projectUuid
                                                        }
                                                    />
                                                </Group>
                                                <Text size="sm" c="dimmed">
                                                    {isExpanded
                                                        ? 'Hide'
                                                        : 'View'}
                                                </Text>
                                            </Group>
                                        </Box>
                                        <Collapse in={isExpanded}>
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
            </Paper>
            <CreateMcpServerModal
                opened={isCreateMcpServerModalOpen}
                onClose={createMcpServerModalHandlers.close}
                onSubmit={handleCreateMcpServer}
                isLoading={isCreatingMcpServer || isPersistingSelection}
            />
            <AttachMcpServersModal
                opened={isAttachMcpServersModalOpen}
                onClose={handleCloseAttachMcpServersModal}
                onSubmit={handleAttachMcpServers}
                isLoading={isLoadingMcpServers || isPersistingSelection}
                options={availableMcpServerOptions}
                value={attachSelection}
                onChange={handleAttachSelectionChange}
            />
        </>
    );
};

import {
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
    Group,
    Menu,
    MultiSelect,
    Paper,
    PasswordInput,
    SegmentedControl,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconDots,
    IconPlug,
    IconPlugConnected,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { BetaBadge } from '../../../../components/common/BetaBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useProjectAiMcpServers,
    useProjectCreateAiMcpServerMutation,
    useStartMcpOAuthConnectionMutation,
} from '../hooks/useProjectAiMcpServers';

const CREATE_NEW_MCP_OPTION_VALUE = '__create_new_mcp__';

const createMcpServerFormSchema = z
    .object({
        name: z.string().trim().min(1, 'Name is required'),
        url: z.string().trim().url('Enter a valid URL'),
        authType: z.enum(['none', 'bearer', 'oauth']),
        bearerToken: z.string(),
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
    connectionStatus: AiMcpServerConnectionStatus | null,
) => {
    switch (connectionStatus) {
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
    const [isSharedOauthAcknowledged, setIsSharedOauthAcknowledged] =
        useState(false);
    const form = useForm<z.infer<typeof createMcpServerFormSchema>>({
        initialValues: {
            name: '',
            url: '',
            authType: 'none',
            bearerToken: '',
        },
        validate: zodResolver(createMcpServerFormSchema),
    });

    const handleClose = useCallback(() => {
        form.reset();
        setIsSharedOauthAcknowledged(false);
        onClose();
    }, [form, onClose]);

    const handleSubmit = form.onSubmit(async (values) => {
        await onSubmit(values);
        form.reset();
        setIsSharedOauthAcknowledged(false);
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
                    disabled={
                        form.values.authType === 'oauth' &&
                        !isSharedOauthAcknowledged
                    }
                >
                    {form.values.authType === 'oauth'
                        ? 'Create and connect'
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
                        <Alert
                            color="orange"
                            variant="light"
                            icon={<MantineIcon icon={IconAlertTriangle} />}
                            title="Shared OAuth connection"
                        >
                            <Stack gap={4}>
                                <Text size="sm">
                                    This connection is shared across this
                                    project.
                                </Text>
                                <Text size="sm">
                                    Anyone who can run an agent attached to this
                                    MCP can use the connected account.
                                </Text>
                                <Text size="sm">
                                    Actions on the remote system may appear as
                                    the connected account.
                                </Text>
                            </Stack>
                        </Alert>
                    )}
                    {form.values.authType === 'oauth' && (
                        <Checkbox
                            checked={isSharedOauthAcknowledged}
                            onChange={(event) =>
                                setIsSharedOauthAcknowledged(
                                    event.currentTarget.checked,
                                )
                            }
                            label="I understand everyone using agents attached to this MCP will act as the connected account."
                        />
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

export const AiAgentMcpServersInput = ({
    projectUuid,
    value,
    onChange,
}: {
    projectUuid: string;
    value: string[];
    onChange: (value: string[]) => void;
}) => {
    const [isCreateMcpServerModalOpen, createMcpServerModalHandlers] =
        useDisclosure(false);
    const [isAttachMcpServersModalOpen, attachMcpServersModalHandlers] =
        useDisclosure(false);
    const [attachSelection, setAttachSelection] = useState<string[]>([]);
    const { data: mcpServers, isLoading: isLoadingMcpServers } =
        useProjectAiMcpServers(projectUuid);
    const { mutateAsync: createMcpServer, isLoading: isCreatingMcpServer } =
        useProjectCreateAiMcpServerMutation(projectUuid);
    const {
        mutateAsync: startMcpOAuthConnection,
        isLoading: isStartingMcpOAuthConnection,
        variables: startingMcpOAuthConnection,
    } = useStartMcpOAuthConnectionMutation(projectUuid);

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
                            ? `${mcpServer.name} (${getMcpAuthTypeLabel(mcpServer.authType)}, ${getMcpConnectionStatusLabel(mcpServer.connectionStatus)})`
                            : `${mcpServer.name} (${getMcpAuthTypeLabel(mcpServer.authType)})`,
                })),
        ],
        [mcpServers, value],
    );

    const openCreateMcpServerModal = useCallback(() => {
        setAttachSelection([]);
        attachMcpServersModalHandlers.close();
        createMcpServerModalHandlers.open();
    }, [attachMcpServersModalHandlers, createMcpServerModalHandlers]);

    const openAttachMcpServersModal = useCallback(() => {
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

    const handleAttachMcpServers = useCallback(() => {
        onChange(Array.from(new Set([...value, ...attachSelection])));
        setAttachSelection([]);
        attachMcpServersModalHandlers.close();
    }, [attachMcpServersModalHandlers, attachSelection, onChange, value]);

    const handleCloseAttachMcpServersModal = useCallback(() => {
        setAttachSelection([]);
        attachMcpServersModalHandlers.close();
    }, [attachMcpServersModalHandlers]);

    const handleCreateMcpServer = useCallback(
        async (values: z.infer<typeof createMcpServerFormSchema>) => {
            const popupWindow =
                values.authType === 'oauth'
                    ? window.open('', 'mcp-oauth-popup', 'width=600,height=700')
                    : null;
            try {
                const mcpServer = await createMcpServer({
                    name: values.name.trim(),
                    url: values.url.trim(),
                    authType: values.authType,
                    credentials:
                        values.authType === 'bearer'
                            ? {
                                  bearerToken: values.bearerToken.trim(),
                              }
                            : null,
                });

                onChange(Array.from(new Set([...value, mcpServer.uuid])));
                createMcpServerModalHandlers.close();

                if (mcpServer.authType === 'oauth') {
                    await startMcpOAuthConnection({
                        mcpServerUuid: mcpServer.uuid,
                        popupWindow,
                    });
                }
            } catch (error) {
                popupWindow?.close();
                throw error;
            }
        },
        [
            createMcpServer,
            createMcpServerModalHandlers,
            onChange,
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

    const handleRemoveMcpServer = useCallback(
        (mcpServerUuid: string) => {
            onChange(
                value.filter((selectedUuid) => selectedUuid !== mcpServerUuid),
            );
        },
        [onChange, value],
    );

    const renderMcpServerActionMenu = useCallback(
        (
            mcpServer: AiMcpServer,
            connectionStatus: AiMcpServerConnectionStatus | null,
            isConnecting: boolean,
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
                        <ActionIcon variant="subtle" color="gray">
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {mcpServer.authType === 'oauth' && (
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconPlugConnected} />
                                }
                                onClick={() => {
                                    void handleStartMcpOAuthConnection(
                                        mcpServer.uuid,
                                    );
                                }}
                                disabled={isConnecting}
                            >
                                {isConnecting
                                    ? 'Connecting...'
                                    : connectionStatus === 'connected' ||
                                        connectionStatus === 'error'
                                      ? 'Reconnect'
                                      : 'Connect account'}
                            </Menu.Item>
                        )}
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() =>
                                handleRemoveMcpServer(mcpServer.uuid)
                            }
                            disabled={isConnecting}
                            color="red"
                        >
                            Remove
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            );
        },
        [handleRemoveMcpServer, handleStartMcpOAuthConnection],
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
                        <Button
                            variant="default"
                            size="compact-xs"
                            onClick={openAttachMcpServersModal}
                        >
                            + Add
                        </Button>
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
                                <Button
                                    variant="default"
                                    size="xs"
                                    disabled={isLoadingMcpServers}
                                    onClick={openAttachMcpServersModal}
                                >
                                    + Add
                                </Button>
                            </Stack>
                        </Center>
                    )}
                    {selectedMcpServers.length > 0 && (
                        <Table.ScrollContainer minWidth={560}>
                            <Table
                                highlightOnHover
                                withTableBorder
                                withColumnBorders={false}
                                verticalSpacing="sm"
                                style={{
                                    borderRadius: 'var(--mantine-radius-md)',
                                    overflow: 'hidden',
                                }}
                            >
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Name</Table.Th>
                                        <Table.Th w={140}>Type</Table.Th>
                                        <Table.Th w={160}>Status</Table.Th>
                                        <Table.Th w={56} />
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {selectedMcpServers.map((mcpServer) => {
                                        const isConnecting =
                                            mcpServer.authType === 'oauth' &&
                                            isStartingMcpOAuthConnection &&
                                            startingMcpOAuthConnection?.mcpServerUuid ===
                                                mcpServer.uuid;
                                        const connectionStatus = isConnecting
                                            ? 'connecting'
                                            : mcpServer.connectionStatus;

                                        return (
                                            <Table.Tr key={mcpServer.uuid}>
                                                <Table.Td>
                                                    <Stack gap={2}>
                                                        <Text fw={600}>
                                                            {mcpServer.name}
                                                        </Text>
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                        >
                                                            {mcpServer.url}
                                                        </Text>
                                                        {mcpServer.error && (
                                                            <Text
                                                                size="xs"
                                                                c="red.7"
                                                            >
                                                                {
                                                                    mcpServer.error
                                                                }
                                                            </Text>
                                                        )}
                                                    </Stack>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text
                                                        fw={450}
                                                        c="ldDark.9"
                                                        size="sm"
                                                    >
                                                        {getMcpAuthTypeLabel(
                                                            mcpServer.authType,
                                                        )}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        variant="light"
                                                        color={getMcpConnectionStatusColor(
                                                            connectionStatus,
                                                        )}
                                                    >
                                                        {getMcpConnectionStatusLabel(
                                                            connectionStatus,
                                                        )}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group
                                                        justify="flex-end"
                                                        wrap="nowrap"
                                                    >
                                                        {renderMcpServerActionMenu(
                                                            mcpServer,
                                                            connectionStatus,
                                                            isConnecting,
                                                        )}
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}
                </Stack>
            </Paper>
            <CreateMcpServerModal
                opened={isCreateMcpServerModalOpen}
                onClose={createMcpServerModalHandlers.close}
                onSubmit={handleCreateMcpServer}
                isLoading={isCreatingMcpServer}
            />
            <AttachMcpServersModal
                opened={isAttachMcpServersModalOpen}
                onClose={handleCloseAttachMcpServersModal}
                onSubmit={handleAttachMcpServers}
                isLoading={isLoadingMcpServers}
                options={availableMcpServerOptions}
                value={attachSelection}
                onChange={handleAttachSelectionChange}
            />
        </>
    );
};

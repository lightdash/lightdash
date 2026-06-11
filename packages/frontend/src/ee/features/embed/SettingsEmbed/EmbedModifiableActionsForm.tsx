import {
    ServiceAccountScope,
    type CreateEmbedJwt,
    type ServiceAccount,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Code,
    Divider,
    Group,
    Menu,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    ThemeIcon,
    Title,
} from '@mantine-8/core';
import {
    IconCalendarShare,
    IconChartBar,
    IconChevronDown,
    IconFolder,
    IconKey,
    IconPlus,
    IconUserShield,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useCreateMutation,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { useCustomRoles } from '../../customRoles/useCustomRoles';
import { useServiceAccounts } from '../../serviceAccounts/useServiceAccounts';

const SYSTEM_ROLE_OPTIONS = [
    { value: ServiceAccountScope.SYSTEM_ADMIN, label: 'Admin' },
    { value: ServiceAccountScope.SYSTEM_DEVELOPER, label: 'Developer' },
    { value: ServiceAccountScope.SYSTEM_EDITOR, label: 'Editor' },
    {
        value: ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER,
        label: 'Interactive viewer',
    },
    { value: ServiceAccountScope.SYSTEM_VIEWER, label: 'Viewer' },
];

const SCOPE_LABEL: Partial<Record<ServiceAccountScope, string>> = {
    [ServiceAccountScope.SYSTEM_ADMIN]: 'Admin',
    [ServiceAccountScope.SYSTEM_DEVELOPER]: 'Developer',
    [ServiceAccountScope.SYSTEM_EDITOR]: 'Editor',
    [ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER]: 'Interactive viewer',
    [ServiceAccountScope.SYSTEM_VIEWER]: 'Viewer',
    [ServiceAccountScope.SYSTEM_MEMBER]: 'Member',
    [ServiceAccountScope.ORG_ADMIN]: 'Admin',
    [ServiceAccountScope.ORG_EDIT]: 'Editor',
    [ServiceAccountScope.ORG_READ]: 'Viewer',
    [ServiceAccountScope.SCIM_MANAGE]: 'SCIM',
};

const WRITABLE_SERVICE_ACCOUNT_SCOPES = [
    ServiceAccountScope.SYSTEM_ADMIN,
    ServiceAccountScope.SYSTEM_DEVELOPER,
    ServiceAccountScope.SYSTEM_EDITOR,
    ServiceAccountScope.ORG_ADMIN,
    ServiceAccountScope.ORG_EDIT,
];

const MODIFIABLE_ACTIONS = [
    {
        label: 'Scheduled deliveries',
        description: 'Create and manage delivery schedules from embedded views',
        icon: IconCalendarShare,
    },
    {
        label: 'Saved charts',
        description: 'Save new charts created from embed explore flows',
        icon: IconChartBar,
    },
    {
        label: 'Write-backed actions',
        description: 'Run future embed actions that need a Lightdash actor',
        icon: IconUserShield,
    },
];

type Props = {
    projectUuid: string;
    value: CreateEmbedJwt['modifiableActions'] | undefined;
    onChange: (value: CreateEmbedJwt['modifiableActions'] | undefined) => void;
};

const EmbedModifiableActionsForm: FC<Props> = ({
    projectUuid,
    value,
    onChange,
}) => {
    const { listAccounts, createAccount } = useServiceAccounts();
    const { listRoles } = useCustomRoles();
    const createSpaceMutation = useCreateMutation(projectUuid);
    const { data: spaces = [], isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
    );
    const [isEnabled, setIsEnabled] = useState(!!value);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreateSpaceModalOpen, setIsCreateSpaceModalOpen] = useState(false);
    const [selectedServiceAccountUuid, setSelectedServiceAccountUuid] =
        useState<string | undefined>();
    const [selectedSpaceUuid, setSelectedSpaceUuid] = useState<string>();
    const [newServiceAccountDescription, setNewServiceAccountDescription] =
        useState('Embedded customer actions');
    const [newSpaceName, setNewSpaceName] = useState(
        'Embedded customer content',
    );
    const [roleType, setRoleType] = useState<'system' | 'custom'>('system');
    const [systemRole, setSystemRole] = useState(SYSTEM_ROLE_OPTIONS[1].value);
    const [customRole, setCustomRole] = useState<string | null>(null);

    const serviceAccounts = useMemo(
        () => listAccounts.data ?? [],
        [listAccounts.data],
    );

    const customRoleOptions = useMemo(
        () =>
            (listRoles.data ?? []).map((role) => ({
                value: role.roleUuid,
                label: role.name,
            })),
        [listRoles.data],
    );

    const rolesByUuid = useMemo(() => {
        const map = new Map<string, string>();
        customRoleOptions.forEach((role) => map.set(role.value, role.label));
        return map;
    }, [customRoleOptions]);

    const selectedRole = roleType === 'system' ? systemRole : customRole;
    const canCreateServiceAccount = roleType === 'system' || !!customRole;

    const selectedServiceAccount = useMemo(
        () =>
            serviceAccounts.find(
                (account) => account.uuid === selectedServiceAccountUuid,
            ),
        [selectedServiceAccountUuid, serviceAccounts],
    );
    const selectedSpace = useMemo(
        () => spaces.find((space) => space.uuid === selectedSpaceUuid),
        [selectedSpaceUuid, spaces],
    );

    useEffect(() => {
        const matchingAccount = serviceAccounts.find(
            (account) => account.userUuid === value?.serviceAccountUserUuid,
        );
        const defaultAccount =
            serviceAccounts.find(
                (account) =>
                    account.roleUuid ||
                    account.scopes.some((scope) =>
                        WRITABLE_SERVICE_ACCOUNT_SCOPES.includes(scope),
                    ),
            ) ?? serviceAccounts[0];
        const nextServiceAccountUuid =
            matchingAccount?.uuid ?? defaultAccount?.uuid;

        setSelectedServiceAccountUuid((currentUuid) => {
            if (
                currentUuid &&
                serviceAccounts.some((account) => account.uuid === currentUuid)
            ) {
                return currentUuid;
            }
            return nextServiceAccountUuid;
        });
    }, [serviceAccounts, value?.serviceAccountUserUuid]);

    useEffect(() => {
        const nextSpaceUuid =
            value?.spaceUuid &&
            spaces.some((space) => space.uuid === value.spaceUuid)
                ? value.spaceUuid
                : spaces[0]?.uuid;

        setSelectedSpaceUuid((currentUuid) => {
            if (
                currentUuid &&
                spaces.some((space) => space.uuid === currentUuid)
            ) {
                return currentUuid;
            }
            return nextSpaceUuid;
        });
    }, [spaces, value?.spaceUuid]);

    useEffect(() => {
        if (!isEnabled || !selectedServiceAccount || !selectedSpace) {
            onChange(undefined);
            return;
        }

        onChange({
            serviceAccountUserUuid: selectedServiceAccount.userUuid,
            spaceUuid: selectedSpace.uuid,
        });
    }, [isEnabled, onChange, selectedServiceAccount, selectedSpace]);

    const getServiceAccountRoleLabel = (account: ServiceAccount) => {
        if (account.roleUuid) {
            return rolesByUuid.get(account.roleUuid) ?? 'Custom role';
        }
        if (account.scopes.length === 1) {
            return SCOPE_LABEL[account.scopes[0]] ?? account.scopes[0];
        }
        if (account.scopes.length === 0) {
            return 'Custom role';
        }
        return `${account.scopes.length} permissions`;
    };

    const handleCreateServiceAccount = async () => {
        const label =
            newServiceAccountDescription.trim() || 'Embedded customer actions';
        const newAccount = await createAccount.mutateAsync({
            description: label,
            expiresAt: null,
            ...(roleType === 'system'
                ? { scopes: [systemRole as ServiceAccountScope] }
                : { roleUuid: customRole ?? undefined }),
        });

        setSelectedServiceAccountUuid(newAccount.uuid);
        setIsCreateModalOpen(false);
    };

    const handleCreateSpace = async () => {
        const label = newSpaceName.trim() || 'Embedded customer content';
        const newSpace = await createSpaceMutation.mutateAsync({
            name: label,
        });

        setSelectedSpaceUuid(newSpace.uuid);
        setIsCreateSpaceModalOpen(false);
    };

    return (
        <Stack gap="md">
            <Switch
                checked={isEnabled}
                onChange={(event) => setIsEnabled(event.currentTarget.checked)}
                label="Enable modifiable actions"
                description="Allow embedded users to perform actions that create or update Lightdash resources."
            />

            {isEnabled && (
                <Stack gap="md">
                    <Divider />

                    <Stack gap="xs">
                        <Title order={6}>Run actions as</Title>
                        <Text c="dimmed" fz="sm">
                            Select the service account Lightdash should use when
                            an embed action needs write permissions.
                        </Text>
                    </Stack>

                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            Service account
                        </Text>
                        <Menu
                            width="target"
                            position="bottom-start"
                            withinPortal
                        >
                            <Menu.Target>
                                <Button
                                    variant="default"
                                    fullWidth
                                    justify="space-between"
                                    loading={listAccounts.isLoading}
                                    rightSection={
                                        <MantineIcon icon={IconChevronDown} />
                                    }
                                >
                                    {selectedServiceAccount
                                        ? `${selectedServiceAccount.description} - ${getServiceAccountRoleLabel(selectedServiceAccount)}`
                                        : 'Select service account'}
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {serviceAccounts.map((account) => (
                                    <Menu.Item
                                        key={account.uuid}
                                        onClick={() =>
                                            setSelectedServiceAccountUuid(
                                                account.uuid,
                                            )
                                        }
                                    >
                                        <Stack gap={0}>
                                            <Text fz="sm">
                                                {account.description}
                                            </Text>
                                            <Text fz="xs" c="dimmed">
                                                {getServiceAccountRoleLabel(
                                                    account,
                                                )}
                                            </Text>
                                        </Stack>
                                    </Menu.Item>
                                ))}
                                <Menu.Divider />
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() => setIsCreateModalOpen(true)}
                                >
                                    Create new service account
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Text c="dimmed" fz="xs">
                            Required before modifiable actions can be enabled.
                        </Text>
                    </Stack>

                    {selectedServiceAccount && (
                        <Group gap="xs">
                            <Badge
                                variant="light"
                                leftSection={<MantineIcon icon={IconKey} />}
                            >
                                {getServiceAccountRoleLabel(
                                    selectedServiceAccount,
                                )}
                            </Badge>
                            <Text c="dimmed" fz="xs">
                                Service account user:{' '}
                                <Code>{selectedServiceAccount.userUuid}</Code>
                            </Text>
                        </Group>
                    )}

                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            Space for created content
                        </Text>
                        <Menu
                            width="target"
                            position="bottom-start"
                            withinPortal
                        >
                            <Menu.Target>
                                <Button
                                    variant="default"
                                    fullWidth
                                    justify="space-between"
                                    loading={isLoadingSpaces}
                                    rightSection={
                                        <MantineIcon icon={IconChevronDown} />
                                    }
                                >
                                    {selectedSpace
                                        ? selectedSpace.name
                                        : 'Select space'}
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {spaces.map((space) => (
                                    <Menu.Item
                                        key={space.uuid}
                                        onClick={() =>
                                            setSelectedSpaceUuid(space.uuid)
                                        }
                                    >
                                        <Stack gap={0}>
                                            <Text fz="sm">{space.name}</Text>
                                            <Text fz="xs" c="dimmed">
                                                {space.parentSpaceUuid
                                                    ? 'Nested space'
                                                    : 'Top-level space'}
                                            </Text>
                                        </Stack>
                                    </Menu.Item>
                                ))}
                                <Menu.Divider />
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() =>
                                        setIsCreateSpaceModalOpen(true)
                                    }
                                >
                                    Create new space
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Text c="dimmed" fz="xs">
                            Charts and other created content from this embed
                            token are written to this space.
                        </Text>
                    </Stack>

                    {selectedSpace && (
                        <Group gap="xs">
                            <Badge
                                variant="light"
                                leftSection={<MantineIcon icon={IconFolder} />}
                            >
                                Target space
                            </Badge>
                            <Text c="dimmed" fz="xs">
                                Space UUID: <Code>{selectedSpace.uuid}</Code>
                            </Text>
                        </Group>
                    )}

                    <Callout variant="info" title="JWT user override">
                        <Text fz="sm">
                            By default, modifiable actions run as the selected
                            service account user. To run them as a specific
                            Lightdash user instead, include a proposed{' '}
                            <Code>userUuid</Code> claim in the embed JWT. You
                            can find user UUIDs from{' '}
                            <Anchor href="/api/v1/org/users" target="_blank">
                                <Code>/api/v1/org/users</Code>
                            </Anchor>
                            .
                        </Text>
                    </Callout>

                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            Modifiable actions covered
                        </Text>
                        {MODIFIABLE_ACTIONS.map((action) => (
                            <Group key={action.label} gap="sm" wrap="nowrap">
                                <ThemeIcon variant="light" color="blue">
                                    <MantineIcon icon={action.icon} />
                                </ThemeIcon>
                                <Stack gap={0}>
                                    <Text fz="sm" fw={500}>
                                        {action.label}
                                    </Text>
                                    <Text c="dimmed" fz="xs">
                                        {action.description}
                                    </Text>
                                </Stack>
                            </Group>
                        ))}
                    </Stack>
                </Stack>
            )}

            <MantineModal
                opened={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create service account"
                icon={IconKey}
                size="md"
                actions={
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleCreateServiceAccount}
                        loading={createAccount.isLoading}
                        disabled={!canCreateServiceAccount}
                    >
                        Create and use
                    </Button>
                }
            >
                <Stack gap="md">
                    <TextInput
                        label="Description"
                        value={newServiceAccountDescription}
                        onChange={(event) =>
                            setNewServiceAccountDescription(
                                event.currentTarget.value,
                            )
                        }
                    />
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            Role type
                        </Text>
                        <SegmentedControl
                            fullWidth
                            data={[
                                { label: 'System role', value: 'system' },
                                { label: 'Custom role', value: 'custom' },
                            ]}
                            value={roleType}
                            onChange={(value) =>
                                setRoleType(value as 'system' | 'custom')
                            }
                        />
                    </Stack>
                    <Select
                        label={roleType === 'system' ? 'System role' : 'Role'}
                        description={
                            roleType === 'system'
                                ? 'Use an existing Lightdash system role for this service account.'
                                : 'Use one of the existing custom roles for this service account.'
                        }
                        data={
                            roleType === 'system'
                                ? SYSTEM_ROLE_OPTIONS
                                : customRoleOptions
                        }
                        value={selectedRole}
                        onChange={(value) => {
                            if (!value) {
                                return;
                            }
                            if (roleType === 'system') {
                                setSystemRole(value as ServiceAccountScope);
                            } else {
                                setCustomRole(value);
                            }
                        }}
                        searchable
                        disabled={roleType === 'custom' && listRoles.isLoading}
                    />
                </Stack>
            </MantineModal>
            <MantineModal
                opened={isCreateSpaceModalOpen}
                onClose={() => setIsCreateSpaceModalOpen(false)}
                title="Create space"
                icon={IconFolder}
                size="md"
                actions={
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleCreateSpace}
                        loading={createSpaceMutation.isLoading}
                    >
                        Create and use
                    </Button>
                }
            >
                <Stack gap="md">
                    <TextInput
                        label="Space name"
                        value={newSpaceName}
                        onChange={(event) =>
                            setNewSpaceName(event.currentTarget.value)
                        }
                    />
                </Stack>
            </MantineModal>
        </Stack>
    );
};

export default EmbedModifiableActionsForm;

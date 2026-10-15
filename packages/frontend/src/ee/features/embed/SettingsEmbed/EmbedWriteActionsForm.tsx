import {
    EMBED_MAX_SOURCE_SPACE_UUIDS,
    ProjectMemberRole,
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
    MultiSelect,
    ScrollArea,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import {
    IconChevronDown,
    IconFolder,
    IconKey,
    IconPlus,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useCreateMutation,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import i18n from '../../../../i18n/i18n';
import { useCustomRoles } from '../../customRoles/useCustomRoles';
import { useServiceAccounts } from '../../serviceAccounts/useServiceAccounts';
import styles from './EmbedWriteActionsForm.module.css';

const roleLabel = (key: string) => i18n.t(`roles.${key}`, { ns: 'embed' });

const SYSTEM_ROLE_OPTIONS = [
    {
        value: ServiceAccountScope.SYSTEM_ADMIN,
        get label() {
            return roleLabel('admin');
        },
    },
    {
        value: ServiceAccountScope.SYSTEM_DEVELOPER,
        get label() {
            return roleLabel('developer');
        },
    },
    {
        value: ServiceAccountScope.SYSTEM_EDITOR,
        get label() {
            return roleLabel('editor');
        },
    },
    {
        value: ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER,
        get label() {
            return roleLabel('interactiveViewer');
        },
    },
    {
        value: ServiceAccountScope.SYSTEM_VIEWER,
        get label() {
            return roleLabel('viewer');
        },
    },
];

const AI_AGENT_SYSTEM_ROLE_OPTIONS = SYSTEM_ROLE_OPTIONS.filter(
    (option) =>
        ![
            ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER,
            ServiceAccountScope.SYSTEM_VIEWER,
        ].includes(option.value),
);

const SCOPE_LABEL_KEY: Partial<Record<ServiceAccountScope, string>> = {
    [ServiceAccountScope.SYSTEM_ADMIN]: 'admin',
    [ServiceAccountScope.SYSTEM_DEVELOPER]: 'developer',
    [ServiceAccountScope.SYSTEM_EDITOR]: 'editor',
    [ServiceAccountScope.SYSTEM_INTERACTIVE_VIEWER]: 'interactiveViewer',
    [ServiceAccountScope.SYSTEM_VIEWER]: 'viewer',
    [ServiceAccountScope.SYSTEM_MEMBER]: 'member',
    [ServiceAccountScope.ORG_ADMIN]: 'admin',
    [ServiceAccountScope.ORG_EDIT]: 'editor',
    [ServiceAccountScope.ORG_READ]: 'viewer',
    [ServiceAccountScope.SCIM_MANAGE]: 'scim',
};

const WRITABLE_SERVICE_ACCOUNT_SCOPES = [
    ServiceAccountScope.SYSTEM_ADMIN,
    ServiceAccountScope.SYSTEM_DEVELOPER,
    ServiceAccountScope.SYSTEM_EDITOR,
    ServiceAccountScope.ORG_ADMIN,
    ServiceAccountScope.ORG_EDIT,
];

const SERVICE_ACCOUNT_SCOPE_PROJECT_ROLE_MAP: Partial<
    Record<ServiceAccountScope, ProjectMemberRole>
> = {
    [ServiceAccountScope.SYSTEM_ADMIN]: ProjectMemberRole.ADMIN,
    [ServiceAccountScope.SYSTEM_DEVELOPER]: ProjectMemberRole.DEVELOPER,
    [ServiceAccountScope.SYSTEM_EDITOR]: ProjectMemberRole.EDITOR,
};

type Props = {
    projectUuid: string;
    value: CreateEmbedJwt['writeActions'] | undefined;
    onChange: (value: CreateEmbedJwt['writeActions'] | undefined) => void;
    required?: boolean;
    fixedWriteSpaceUuid?: string;
    // Dashboard tokens can let editors add existing charts from other spaces.
    allowSourceSpaces?: boolean;
};

const EmbedWriteActionsForm: FC<Props> = ({
    projectUuid,
    value,
    onChange,
    required = false,
    fixedWriteSpaceUuid,
    allowSourceSpaces = false,
}) => {
    const { t } = useTranslation('embed');
    const { listAccounts, createAccount } = useServiceAccounts();
    const { listRoles } = useCustomRoles();
    const createSpaceMutation = useCreateMutation(projectUuid);
    const { data: spaces = [], isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
    );
    const [isEnabled, setIsEnabled] = useState(required || !!value);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreateSpaceModalOpen, setIsCreateSpaceModalOpen] = useState(false);
    const [selectedServiceAccountUuid, setSelectedServiceAccountUuid] =
        useState<string | undefined>();
    const [selectedSpaceUuid, setSelectedSpaceUuid] = useState<string>();
    const [sourceSpaceUuids, setSourceSpaceUuids] = useState<string[]>(
        value?.sourceSpaceUuids ?? [],
    );
    const [newServiceAccountDescription, setNewServiceAccountDescription] =
        useState(t('writeActions.defaultServiceAccountName'));
    const [newSpaceName, setNewSpaceName] = useState(
        t('writeActions.defaultSpaceName'),
    );
    const [roleType, setRoleType] = useState<'system' | 'custom'>('system');
    const [systemRole, setSystemRole] = useState(
        required
            ? ServiceAccountScope.SYSTEM_EDITOR
            : SYSTEM_ROLE_OPTIONS[1].value,
    );
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

    const systemRoleOptions = required
        ? AI_AGENT_SYSTEM_ROLE_OPTIONS
        : SYSTEM_ROLE_OPTIONS;
    const selectedRole = roleType === 'system' ? systemRole : customRole;
    const canCreateServiceAccount = roleType === 'system' || !!customRole;

    const selectableServiceAccounts = useMemo(
        () =>
            required
                ? serviceAccounts.filter(
                      (account) =>
                          account.roleUuid ||
                          ('projectAccessCount' in account &&
                              account.projectAccessCount > 0) ||
                          account.scopes.some((scope) =>
                              WRITABLE_SERVICE_ACCOUNT_SCOPES.includes(scope),
                          ),
                  )
                : serviceAccounts,
        [required, serviceAccounts],
    );

    const selectedServiceAccount = useMemo(
        () =>
            selectableServiceAccounts.find(
                (account) => account.uuid === selectedServiceAccountUuid,
            ),
        [selectableServiceAccounts, selectedServiceAccountUuid],
    );
    const selectedSpace = useMemo(
        () => spaces.find((space) => space.uuid === selectedSpaceUuid),
        [selectedSpaceUuid, spaces],
    );
    const sourceSpaceOptions = useMemo(
        () =>
            spaces
                .filter((space) => space.uuid !== selectedSpaceUuid)
                .map((space) => ({ value: space.uuid, label: space.name })),
        [selectedSpaceUuid, spaces],
    );
    const selectedSourceSpaceUuids = useMemo(
        () =>
            allowSourceSpaces
                ? sourceSpaceUuids.filter((uuid) =>
                      sourceSpaceOptions.some(
                          (option) => option.value === uuid,
                      ),
                  )
                : [],
        [allowSourceSpaces, sourceSpaceOptions, sourceSpaceUuids],
    );

    useEffect(() => {
        if (required) {
            setIsEnabled(true);
            if (
                !AI_AGENT_SYSTEM_ROLE_OPTIONS.some(
                    (option) => option.value === systemRole,
                )
            ) {
                setSystemRole(ServiceAccountScope.SYSTEM_EDITOR);
            }
        }
    }, [required, systemRole]);

    useEffect(() => {
        const matchingAccount = selectableServiceAccounts.find(
            (account) => account.userUuid === value?.serviceAccountUserUuid,
        );
        const defaultAccount =
            selectableServiceAccounts.find(
                (account) =>
                    account.roleUuid ||
                    ('projectAccessCount' in account &&
                        account.projectAccessCount > 0) ||
                    account.scopes.some((scope) =>
                        WRITABLE_SERVICE_ACCOUNT_SCOPES.includes(scope),
                    ),
            ) ?? selectableServiceAccounts[0];
        const nextServiceAccountUuid =
            matchingAccount?.uuid ?? defaultAccount?.uuid;

        setSelectedServiceAccountUuid((currentUuid) => {
            if (
                currentUuid &&
                selectableServiceAccounts.some(
                    (account) => account.uuid === currentUuid,
                )
            ) {
                return currentUuid;
            }
            return nextServiceAccountUuid;
        });
    }, [selectableServiceAccounts, value?.serviceAccountUserUuid]);

    useEffect(() => {
        const nextSpaceUuid =
            fixedWriteSpaceUuid &&
            spaces.some((space) => space.uuid === fixedWriteSpaceUuid)
                ? fixedWriteSpaceUuid
                : value?.spaceUuid &&
                    spaces.some((space) => space.uuid === value.spaceUuid)
                  ? value.spaceUuid
                  : spaces[0]?.uuid;

        setSelectedSpaceUuid((currentUuid) => {
            if (
                fixedWriteSpaceUuid &&
                spaces.some((space) => space.uuid === fixedWriteSpaceUuid)
            ) {
                return fixedWriteSpaceUuid;
            }
            if (
                currentUuid &&
                spaces.some((space) => space.uuid === currentUuid)
            ) {
                return currentUuid;
            }
            return nextSpaceUuid;
        });
    }, [fixedWriteSpaceUuid, spaces, value?.spaceUuid]);

    useEffect(() => {
        if (!isEnabled || !selectedServiceAccount || !selectedSpace) {
            onChange(undefined);
            return;
        }

        onChange({
            serviceAccountUserUuid: selectedServiceAccount.userUuid,
            spaceUuid: selectedSpace.uuid,
            ...(selectedSourceSpaceUuids.length > 0
                ? { sourceSpaceUuids: selectedSourceSpaceUuids }
                : {}),
        });
    }, [
        isEnabled,
        onChange,
        selectedServiceAccount,
        selectedSpace,
        selectedSourceSpaceUuids,
    ]);

    const getServiceAccountRoleLabel = (account: ServiceAccount) => {
        if (account.roleUuid) {
            return rolesByUuid.get(account.roleUuid) ?? t('roles.customRole');
        }
        if (account.scopes.length === 1) {
            const key = SCOPE_LABEL_KEY[account.scopes[0]];
            return key ? t(`roles.${key}`) : account.scopes[0];
        }
        if (account.scopes.length === 0) {
            return t('roles.customRole');
        }
        return t('roles.permissionCount', { count: account.scopes.length });
    };

    const handleCreateServiceAccount = async () => {
        const label =
            newServiceAccountDescription.trim() ||
            t('writeActions.defaultServiceAccountName');
        const projectRole =
            roleType === 'system'
                ? SERVICE_ACCOUNT_SCOPE_PROJECT_ROLE_MAP[
                      systemRole as ServiceAccountScope
                  ]
                : undefined;
        if (required && roleType === 'system' && !projectRole) {
            return;
        }
        const newAccount = await createAccount.mutateAsync({
            description: label,
            expiresAt: null,
            ...(required
                ? {
                      scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                      projectAccess:
                          roleType === 'system'
                              ? [{ projectUuid, role: projectRole }]
                              : [
                                    {
                                        projectUuid,
                                        roleUuid: customRole ?? undefined,
                                    },
                                ],
                  }
                : roleType === 'system'
                  ? { scopes: [systemRole as ServiceAccountScope] }
                  : { roleUuid: customRole ?? undefined }),
        });

        setSelectedServiceAccountUuid(newAccount.uuid);
        setIsCreateModalOpen(false);
    };

    const handleCreateSpace = async () => {
        const label = newSpaceName.trim() || t('writeActions.defaultSpaceName');
        const newSpace = await createSpaceMutation.mutateAsync({
            name: label,
        });

        setSelectedSpaceUuid(newSpace.uuid);
        setIsCreateSpaceModalOpen(false);
    };

    return (
        <Stack gap="md">
            {!required && (
                <Switch
                    checked={isEnabled}
                    onChange={(event) =>
                        setIsEnabled(event.currentTarget.checked)
                    }
                    label={t('writeActions.enable')}
                    description={t('writeActions.enableDescription')}
                />
            )}

            {isEnabled && (
                <Stack gap="md">
                    {!required && <Divider />}

                    <Stack gap="xs">
                        <Title order={6}>{t('writeActions.runAs')}</Title>
                        <Text c="dimmed" fz="sm">
                            {t('writeActions.runAsDescription')}
                        </Text>
                    </Stack>

                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            {t('writeActions.serviceAccount')}
                        </Text>
                        <Menu
                            width="target"
                            position="bottom-start"
                            middlewares={{ flip: true, shift: true }}
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
                                        : t(
                                              'writeActions.selectServiceAccount',
                                          )}
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <ScrollArea.Autosize
                                    className={styles.dropdownScrollArea}
                                    type="auto"
                                >
                                    {selectableServiceAccounts.map(
                                        (account) => (
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
                                        ),
                                    )}
                                    {selectableServiceAccounts.length === 0 && (
                                        <Menu.Label>
                                            {t('writeActions.noCompatible')}
                                        </Menu.Label>
                                    )}
                                </ScrollArea.Autosize>
                                <Menu.Divider />
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() => setIsCreateModalOpen(true)}
                                >
                                    {t('writeActions.createServiceAccount')}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Text c="dimmed" fz="xs">
                            {t('writeActions.requiredNote')}
                        </Text>
                    </Stack>

                    {selectedServiceAccount && (
                        <Group gap="xs">
                            <Badge leftSection={<MantineIcon icon={IconKey} />}>
                                {getServiceAccountRoleLabel(
                                    selectedServiceAccount,
                                )}
                            </Badge>
                            <Text c="dimmed" fz="xs">
                                <Trans
                                    t={t}
                                    i18nKey="writeActions.serviceAccountUser"
                                    values={{
                                        uuid: selectedServiceAccount.userUuid,
                                    }}
                                    components={{ code: <Code /> }}
                                />
                            </Text>
                        </Group>
                    )}

                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            {t('writeActions.spaceForContent')}
                        </Text>
                        <Menu
                            width="target"
                            position="bottom-start"
                            middlewares={{ flip: true, shift: true }}
                        >
                            <Menu.Target>
                                <Button
                                    variant="default"
                                    fullWidth
                                    justify="space-between"
                                    loading={isLoadingSpaces}
                                    disabled={fixedWriteSpaceUuid !== undefined}
                                    rightSection={
                                        <MantineIcon icon={IconChevronDown} />
                                    }
                                >
                                    {selectedSpace
                                        ? selectedSpace.name
                                        : t('writeActions.selectSpace')}
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <ScrollArea.Autosize
                                    className={styles.dropdownScrollArea}
                                    type="auto"
                                >
                                    {spaces.map((space) => (
                                        <Menu.Item
                                            key={space.uuid}
                                            onClick={() =>
                                                setSelectedSpaceUuid(space.uuid)
                                            }
                                        >
                                            <Stack gap={0}>
                                                <Text fz="sm">
                                                    {space.name}
                                                </Text>
                                                <Text fz="xs" c="dimmed">
                                                    {space.parentSpaceUuid
                                                        ? t(
                                                              'writeActions.nestedSpace',
                                                          )
                                                        : t(
                                                              'writeActions.topLevelSpace',
                                                          )}
                                                </Text>
                                            </Stack>
                                        </Menu.Item>
                                    ))}
                                </ScrollArea.Autosize>
                                <Menu.Divider />
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() =>
                                        setIsCreateSpaceModalOpen(true)
                                    }
                                >
                                    {t('writeActions.createSpace')}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <Text c="dimmed" fz="xs">
                            {fixedWriteSpaceUuid
                                ? t('writeActions.dashboardSpaceNote')
                                : t('writeActions.spaceNote')}
                        </Text>
                    </Stack>

                    {selectedSpace && (
                        <Group gap="xs">
                            <Badge
                                leftSection={<MantineIcon icon={IconFolder} />}
                            >
                                {t('writeActions.targetSpace')}
                            </Badge>
                            <Text c="dimmed" fz="xs">
                                <Trans
                                    t={t}
                                    i18nKey="writeActions.spaceUuid"
                                    values={{ uuid: selectedSpace.uuid }}
                                    components={{ code: <Code /> }}
                                />
                            </Text>
                        </Group>
                    )}

                    {allowSourceSpaces && (
                        <MultiSelect
                            label={t('writeActions.sourceSpaces')}
                            description={t(
                                'writeActions.sourceSpacesDescription',
                            )}
                            placeholder={
                                selectedSourceSpaceUuids.length === 0
                                    ? t('writeActions.sourceSpacesPlaceholder')
                                    : undefined
                            }
                            data={sourceSpaceOptions}
                            value={selectedSourceSpaceUuids}
                            onChange={setSourceSpaceUuids}
                            maxValues={EMBED_MAX_SOURCE_SPACE_UUIDS}
                            searchable
                            clearable
                            disabled={isLoadingSpaces}
                        />
                    )}

                    <Callout
                        variant="info"
                        title={t('writeActions.jwtOverride')}
                    >
                        <Text fz="sm">
                            <Trans
                                t={t}
                                i18nKey="writeActions.jwtOverrideDescription"
                                components={{
                                    code: <Code />,
                                    anchor: (
                                        <Anchor
                                            href="/api/v1/org/users"
                                            target="_blank"
                                        />
                                    ),
                                }}
                            />
                        </Text>
                    </Callout>
                </Stack>
            )}

            <MantineModal
                opened={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title={t('writeActions.createServiceAccountTitle')}
                icon={IconKey}
                size="md"
                actions={
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleCreateServiceAccount}
                        loading={createAccount.isLoading}
                        disabled={!canCreateServiceAccount}
                    >
                        {t('writeActions.createAndUse')}
                    </Button>
                }
            >
                <Stack gap="md">
                    <TextInput
                        label={t('writeActions.description')}
                        description={t('writeActions.descriptionNote')}
                        value={newServiceAccountDescription}
                        onChange={(event) =>
                            setNewServiceAccountDescription(
                                event.currentTarget.value,
                            )
                        }
                    />
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            {t('writeActions.roleType')}
                        </Text>
                        <SegmentedControl
                            fullWidth
                            data={[
                                {
                                    label: t('writeActions.systemRole'),
                                    value: 'system',
                                },
                                {
                                    label: t('roles.customRole'),
                                    value: 'custom',
                                },
                            ]}
                            value={roleType}
                            onChange={(value) =>
                                setRoleType(value as 'system' | 'custom')
                            }
                        />
                    </Stack>
                    <Select
                        label={
                            roleType === 'system'
                                ? t('writeActions.systemRole')
                                : t('writeActions.role')
                        }
                        description={
                            roleType === 'system'
                                ? t('writeActions.systemRoleDescription')
                                : t('writeActions.customRoleDescription')
                        }
                        data={
                            roleType === 'system'
                                ? systemRoleOptions
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
                title={t('writeActions.createSpaceTitle')}
                icon={IconFolder}
                size="md"
                actions={
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={handleCreateSpace}
                        loading={createSpaceMutation.isLoading}
                    >
                        {t('writeActions.createAndUse')}
                    </Button>
                }
            >
                <Stack gap="md">
                    <TextInput
                        label={t('writeActions.spaceName')}
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

export default EmbedWriteActionsForm;

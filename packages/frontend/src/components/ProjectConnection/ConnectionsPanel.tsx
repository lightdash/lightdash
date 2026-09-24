import { subject } from '@casl/ability';
import {
    assertUnreachable,
    omitEmptySecrets,
    ProjectType,
    validateWarehouseConnectionName,
    WAREHOUSE_CONNECTION_NAME_MAX_LENGTH,
    type CreateWarehouseCredentials,
    type Project,
    type WarehouseConnection,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm as useMantineForm } from '@mantine/form';
import {
    IconDatabase,
    IconDots,
    IconPencil,
    IconPlugConnected,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import {
    hidesConnectionsPanel,
    isSingleConnectionProject,
    useCreateWarehouseConnection,
    useDeleteWarehouseConnection,
    useRenameWarehouseConnection,
    useUpdateWarehouseConnection,
    useWarehouseConnection,
    useWarehouseConnections,
} from '../../hooks/useWarehouseConnections';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { ConnectionFields } from './ConnectionFields';
import { unusedDbtFormValues } from './connectionFormDefaults';
import classes from './ConnectionsPanel.module.css';
import { EnableMultipleConnectionsCard } from './EnableMultipleConnections';
import { useForm } from './formContext';
import { getWarehouseLabel } from './ProjectConnectFlow/utils';
import WarehouseDatabaseListingFields, {
    type WarehouseDatabaseListingValues,
} from './WarehouseDatabaseListingFields';
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';
import { warehouseValueValidators } from './WarehouseForms/validators';

const ConnectionRow: FC<{
    connection: WarehouseConnection;
    onEdit: (connection: WarehouseConnection) => void;
    onRename: (connection: WarehouseConnection) => void;
    onEditListing: (connection: WarehouseConnection) => void;
    onRemove: (connection: WarehouseConnection) => void;
}> = ({ connection, onEdit, onRename, onEditListing, onRemove }) => (
    <Group className={classes.row} gap="sm" wrap="nowrap">
        <MantineIcon
            icon={IconPlugConnected}
            size="lg"
            className={classes.mark}
        />
        <Box className={classes.info}>
            <Group gap={6} wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                    {connection.name}
                </Text>
                {connection.isOriginal && <Badge size="sm">Original</Badge>}
                {connection.organizationWarehouseCredentialsUuid !== null && (
                    <Badge size="sm">Organisation credential</Badge>
                )}
            </Group>
            <Text className={classes.meta} c="dimmed" truncate>
                {getWarehouseLabel(connection.warehouseType)}
            </Text>
        </Box>
        <Menu position="bottom-end">
            <Menu.Target>
                <ActionIcon aria-label={`Actions for ${connection.name}`}>
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                {!connection.isOriginal && (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => onEdit(connection)}
                    >
                        Edit
                    </Menu.Item>
                )}
                <Menu.Item onClick={() => onRename(connection)}>
                    Rename
                </Menu.Item>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconDatabase} />}
                    onClick={() => onEditListing(connection)}
                >
                    SQL runner databases
                </Menu.Item>
                {!connection.isOriginal && (
                    <Menu.Item
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={() => onRemove(connection)}
                    >
                        Remove
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    </Group>
);

const AddConnectionModal: FC<{
    projectUuid: string;
    warehouseType: WarehouseTypes;
    onClose: () => void;
}> = ({ projectUuid, warehouseType, onClose }) => {
    const form = useForm({
        initialValues: {
            name: '',
            warehouse: {
                ...warehouseDefaultValues[warehouseType],
            } as CreateWarehouseCredentials,
            ...unusedDbtFormValues,
        },
        validate: {
            name: validateWarehouseConnectionName,
            warehouse: warehouseValueValidators[warehouseType],
        },
        validateInputOnBlur: true,
    });
    const nameRef = useRef<HTMLInputElement>(null);
    const createMutation = useCreateWarehouseConnection(projectUuid, {
        onSuccess: onClose,
        onNameConflict: (message) => {
            form.setFieldError('name', message);
            nameRef.current?.focus();
        },
    });

    const handleSubmit = () => {
        if (form.validate().hasErrors) return;
        createMutation.mutate({
            name: form.values.name.trim(),
            warehouseConnection: form.values.warehouse,
        });
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Add a connection"
            size="lg"
            confirmLabel="Add connection"
            onConfirm={handleSubmit}
            confirmLoading={createMutation.isLoading}
            cancelDisabled={createMutation.isLoading}
        >
            <ConnectionFields
                form={form}
                nameRef={nameRef}
                projectUuid={projectUuid}
                warehouseType={warehouseType}
                showName
                isProjectExtraConnection
                intro="Add another connection of the project's warehouse type. It is tested before it is saved."
            />
        </MantineModal>
    );
};

const EditConnectionForm: FC<{
    projectUuid: string;
    connection: WarehouseConnection;
    credentials: CreateWarehouseCredentials;
    onClose: () => void;
}> = ({ projectUuid, connection, credentials, onClose }) => {
    const savedProject = { warehouseConnection: credentials } as Project;
    const updateMutation = useUpdateWarehouseConnection(projectUuid, {
        onSuccess: onClose,
    });
    const form = useForm({
        initialValues: {
            name: connection.name,
            warehouse: credentials,
            ...unusedDbtFormValues,
        },
        validate: {
            warehouse: warehouseValueValidators[connection.warehouseType],
        },
        validateInputOnBlur: true,
    });

    const handleSubmit = () => {
        if (form.validate().hasErrors) return;
        updateMutation.mutate({
            warehouseConnectionUuid: connection.warehouseConnectionUuid,
            data: {
                warehouseConnection: omitEmptySecrets(form.values.warehouse),
            },
        });
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`Edit ${connection.name}`}
            size="lg"
            confirmLabel="Save changes"
            onConfirm={handleSubmit}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <ConnectionFields
                form={form}
                projectUuid={projectUuid}
                warehouseType={connection.warehouseType}
                savedProject={savedProject}
                showName={false}
                isProjectExtraConnection={
                    connection.organizationWarehouseCredentialsUuid === null
                }
                intro="Leave a secret blank to keep the saved one. The connection is tested before it is saved."
            />
        </MantineModal>
    );
};

const EditConnectionModal: FC<{
    projectUuid: string;
    connection: WarehouseConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const { data, isInitialLoading } = useWarehouseConnection(
        projectUuid,
        connection.warehouseConnectionUuid,
    );

    if (isInitialLoading || !data?.warehouseConnection) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title={`Edit ${connection.name}`}
                size="lg"
                cancelLabel={false}
            >
                <Group justify="center" py="xl">
                    <Loader size="sm" />
                </Group>
            </MantineModal>
        );
    }

    return (
        <EditConnectionForm
            projectUuid={projectUuid}
            connection={connection}
            credentials={data.warehouseConnection as CreateWarehouseCredentials}
            onClose={onClose}
        />
    );
};

const RenameConnectionModal: FC<{
    projectUuid: string;
    connection: WarehouseConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const nameRef = useRef<HTMLInputElement>(null);
    const form = useMantineForm({
        initialValues: { name: connection.name },
        validate: { name: validateWarehouseConnectionName },
    });
    const renameMutation = useRenameWarehouseConnection(projectUuid, {
        onSuccess: onClose,
        onNameConflict: (message) => {
            form.setFieldError('name', message);
            nameRef.current?.focus();
        },
    });

    const handleSubmit = () => {
        if (form.validate().hasErrors) return;
        renameMutation.mutate({
            warehouseConnectionUuid: connection.warehouseConnectionUuid,
            name: form.values.name.trim(),
        });
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Rename connection"
            confirmLabel="Save changes"
            onConfirm={handleSubmit}
            confirmLoading={renameMutation.isLoading}
            cancelDisabled={renameMutation.isLoading}
        >
            <TextInput
                ref={nameRef}
                label="Name"
                required
                maxLength={WAREHOUSE_CONNECTION_NAME_MAX_LENGTH}
                {...form.getInputProps('name')}
            />
        </MantineModal>
    );
};

const ListingSettingsModal: FC<{
    projectUuid: string;
    connection: WarehouseConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const form = useMantineForm<WarehouseDatabaseListingValues>({
        initialValues: {
            listAllDatabases: connection.listAllDatabases,
            additionalDatabases: connection.additionalDatabases,
        },
    });
    const updateMutation = useUpdateWarehouseConnection(projectUuid, {
        onSuccess: onClose,
    });

    const handleSubmit = () => {
        updateMutation.mutate({
            warehouseConnectionUuid: connection.warehouseConnectionUuid,
            data: {
                listAllDatabases: form.values.listAllDatabases,
                additionalDatabases: form.values.additionalDatabases,
            },
        });
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`SQL runner databases for ${connection.name}`}
            confirmLabel="Save changes"
            onConfirm={handleSubmit}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <WarehouseDatabaseListingFields
                form={form}
                warehouseType={connection.warehouseType}
                disabled={updateMutation.isLoading}
            />
        </MantineModal>
    );
};

const RemoveConnectionModal: FC<{
    projectUuid: string;
    connection: WarehouseConnection;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const deleteMutation = useDeleteWarehouseConnection(projectUuid, {
        onSuccess: onClose,
    });

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Remove connection"
            variant="delete"
            confirmLabel="Remove"
            confirmLoading={deleteMutation.isLoading}
            cancelDisabled={deleteMutation.isLoading}
            onConfirm={() =>
                deleteMutation.mutate(connection.warehouseConnectionUuid)
            }
        >
            <Stack gap="md">
                <Text>
                    Remove{' '}
                    <Text span fw={600}>
                        {connection.name}
                    </Text>
                    ? A connection that content still uses cannot be removed.
                </Text>
                {deleteMutation.error && (
                    <Text size="sm" c="red">
                        {deleteMutation.error.error.message}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};

type ConnectionAction = {
    kind: 'edit' | 'rename' | 'listing' | 'remove';
    connection: WarehouseConnection;
};

const ConnectionActionModal: FC<{
    projectUuid: string;
    action: ConnectionAction;
    onClose: () => void;
}> = ({ projectUuid, action, onClose }) => {
    switch (action.kind) {
        case 'edit':
            return (
                <EditConnectionModal
                    projectUuid={projectUuid}
                    connection={action.connection}
                    onClose={onClose}
                />
            );
        case 'rename':
            return (
                <RenameConnectionModal
                    projectUuid={projectUuid}
                    connection={action.connection}
                    onClose={onClose}
                />
            );
        case 'listing':
            return (
                <ListingSettingsModal
                    projectUuid={projectUuid}
                    connection={action.connection}
                    onClose={onClose}
                />
            );
        case 'remove':
            return (
                <RemoveConnectionModal
                    projectUuid={projectUuid}
                    connection={action.connection}
                    onClose={onClose}
                />
            );
        default:
            return assertUnreachable(action.kind, 'Unknown connection action');
    }
};

const ConnectionsPanelContent: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data, error, isInitialLoading, isEnabled } =
        useWarehouseConnections(projectUuid);
    const [action, setAction] = useState<ConnectionAction | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);

    if (isEnabled && isSingleConnectionProject(error)) {
        return <EnableMultipleConnectionsCard projectUuid={projectUuid} />;
    }
    if (!isEnabled || hidesConnectionsPanel(error)) {
        return null;
    }

    const connections = data?.connections ?? [];
    const originalWarehouseType = connections.find(
        (connection) => connection.isOriginal,
    )?.warehouseType;
    const canAddConnection = data?.capabilities.canAddConnection ?? false;
    const closeAction = () => setAction(null);

    return (
        <Card padding="lg">
            <Stack gap="md">
                <Title order={5}>Connections</Title>
                {isInitialLoading && (
                    <Group justify="center" py="md">
                        <Loader size="sm" />
                    </Group>
                )}
                {error && (
                    <Text size="sm" c="red">
                        Failed to load connections.
                    </Text>
                )}
                {data && (
                    <Stack gap={0}>
                        {connections.map((connection) => (
                            <ConnectionRow
                                key={connection.warehouseConnectionUuid}
                                connection={connection}
                                onEdit={() =>
                                    setAction({ kind: 'edit', connection })
                                }
                                onRename={() =>
                                    setAction({ kind: 'rename', connection })
                                }
                                onEditListing={() =>
                                    setAction({ kind: 'listing', connection })
                                }
                                onRemove={() =>
                                    setAction({ kind: 'remove', connection })
                                }
                            />
                        ))}
                    </Stack>
                )}
                <Group justify="flex-end">
                    <Tooltip
                        w={300}
                        disabled={
                            canAddConnection || !data?.capabilities.reason
                        }
                        label={data?.capabilities.reason}
                    >
                        <Box>
                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                disabled={
                                    !canAddConnection || !originalWarehouseType
                                }
                                onClick={() => setIsAddOpen(true)}
                            >
                                Add connection
                            </Button>
                        </Box>
                    </Tooltip>
                </Group>
            </Stack>

            {isAddOpen && originalWarehouseType && (
                <AddConnectionModal
                    projectUuid={projectUuid}
                    warehouseType={originalWarehouseType}
                    onClose={() => setIsAddOpen(false)}
                />
            )}
            {action && (
                <ConnectionActionModal
                    projectUuid={projectUuid}
                    action={action}
                    onClose={closeAction}
                />
            )}
        </Card>
    );
};

const ConnectionsPanel: FC<{ savedProject: Project | undefined }> = ({
    savedProject,
}) => {
    const { user } = useApp();
    const canManageProject =
        savedProject !== undefined &&
        user.data?.ability.can(
            'manage',
            subject('Project', {
                organizationUuid: savedProject.organizationUuid,
                projectUuid: savedProject.projectUuid,
            }),
        ) === true;
    return savedProject &&
        canManageProject &&
        savedProject.type !== ProjectType.PREVIEW ? (
        <ConnectionsPanelContent projectUuid={savedProject.projectUuid} />
    ) : null;
};

export default ConnectionsPanel;

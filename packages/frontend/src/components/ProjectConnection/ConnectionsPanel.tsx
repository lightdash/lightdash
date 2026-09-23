import {
    CONNECTION_NAME_MAX_LENGTH,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    omitEmptySecrets,
    validateConnectionName,
    type Connection,
    type CreateWarehouseCredentials,
    type Project,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
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
    IconDots,
    IconInfoCircle,
    IconPencil,
    IconPlugConnected,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import {
    useConnection,
    useConnections,
    useCreateConnection,
    useDeleteConnection,
    useRenameConnection,
    useUpdateConnection,
} from '../../hooks/useConnections';
import { useTestWarehouseConnectionMutation } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import classes from './ConnectionsPanel.module.css';
import ConnectionTestResults from './ConnectionTestResults';
import { dbtDefaults } from './DbtForms/defaultValues';
import { FormProvider, useForm, type Form } from './formContext';
import { getWarehouseLabel } from './ProjectConnectFlow/utils';
import { ProjectFormProvider } from './ProjectFormProvider';
import { warehouseDefaultValues } from './WarehouseForms/defaultValues';
import { warehouseValueValidators } from './WarehouseForms/validators';
import WarehouseSchemaInput from './WarehouseSchemaInput';
import WarehouseSettingsForm from './WarehouseSettingsForm';

// Connections hold warehouse credentials only. The shared project form context
// still requires dbt fields, so they are filled and never rendered.
const unusedDbtFormValues = {
    dbt: { ...dbtDefaults.formValues[DbtProjectType.NONE] },
    dbtVersion: DefaultSupportedDbtVersion,
};

const formatCreatedAt = (createdAt: Date) =>
    new Date(createdAt).toLocaleDateString();

const ConnectionRow: FC<{
    connection: Connection;
    canRemove: boolean;
    onEdit: (connection: Connection) => void;
    onRename: (connection: Connection) => void;
    onRemove: (connection: Connection) => void;
}> = ({ connection, canRemove, onEdit, onRename, onRemove }) => (
    <div className={classes.row}>
        <MantineIcon
            icon={IconPlugConnected}
            size="lg"
            className={classes.mark}
        />
        <div className={classes.info}>
            <Group gap={6} wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                    {connection.name}
                </Text>
                {connection.organizationWarehouseCredentialsUuid !== null && (
                    <Badge size="sm" variant="light" color="gray">
                        Organisation credential
                    </Badge>
                )}
            </Group>
            <Text className={classes.meta} c="dimmed" truncate>
                {getWarehouseLabel(connection.warehouseType)} · added{' '}
                {formatCreatedAt(connection.createdAt)}
            </Text>
        </div>
        <Menu position="bottom-end">
            <Menu.Target>
                <ActionIcon aria-label={`Actions for ${connection.name}`}>
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => onEdit(connection)}
                >
                    Edit
                </Menu.Item>
                <Menu.Item onClick={() => onRename(connection)}>
                    Rename
                </Menu.Item>
                {canRemove && (
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
    </div>
);

/**
 * The shared modal body: a name field plus the project's warehouse form. The
 * warehouse type is the project's, so the form renders no type selector.
 */
const ConnectionFields: FC<{
    form: Form;
    intro: string;
    projectUuid: string;
    warehouseType: WarehouseTypes;
    nameRef?: React.Ref<HTMLInputElement>;
    savedProject?: Project;
}> = ({ form, intro, projectUuid, warehouseType, nameRef, savedProject }) => (
    <FormProvider form={form}>
        <ProjectFormProvider
            projectUuid={projectUuid}
            savedProject={savedProject}
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    {intro}
                </Text>
                <TextInput
                    ref={nameRef}
                    label="Name"
                    description="Shown wherever this connection is picked."
                    placeholder="e.g. Analytics warehouse"
                    required
                    maxLength={CONNECTION_NAME_MAX_LENGTH}
                    {...form.getInputProps('name')}
                />
                <WarehouseSettingsForm disabled={false}>
                    <WarehouseSchemaInput
                        warehouseType={warehouseType}
                        disabled={false}
                        warehouseOnly
                    />
                </WarehouseSettingsForm>
            </Stack>
        </ProjectFormProvider>
    </FormProvider>
);

const TestConnectionAction: FC<{ projectUuid: string; form: Form }> = ({
    projectUuid,
    form,
}) => {
    const {
        mutate: runConnectionTest,
        isLoading,
        data: results,
        reset,
    } = useTestWarehouseConnectionMutation(projectUuid);

    return (
        <Stack gap="sm">
            <Group justify="flex-start">
                <Button
                    variant="default"
                    loading={isLoading}
                    onClick={() => {
                        reset();
                        runConnectionTest(form.values.warehouse);
                    }}
                >
                    Test connection
                </Button>
            </Group>
            {results && <ConnectionTestResults results={results} />}
        </Stack>
    );
};

const AddConnectionModal: FC<{
    projectUuid: string;
    warehouseType: WarehouseTypes;
    opened: boolean;
    onClose: () => void;
}> = ({ projectUuid, warehouseType, opened, onClose }) => {
    const form = useForm({
        initialValues: {
            name: '',
            warehouse: {
                ...warehouseDefaultValues[warehouseType],
            } as CreateWarehouseCredentials,
            ...unusedDbtFormValues,
        },
        validate: {
            name: validateConnectionName,
            warehouse: warehouseValueValidators[warehouseType],
        },
        validateInputOnBlur: true,
    });

    const nameRef = useRef<HTMLInputElement>(null);
    const handleClose = () => {
        form.reset();
        onClose();
    };
    const createMutation = useCreateConnection(projectUuid, {
        onSuccess: handleClose,
        onNameConflict: (message) => {
            form.setFieldError('name', message);
            nameRef.current?.focus();
        },
    });

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        createMutation.mutate({
            name: form.values.name.trim(),
            warehouseConnection: form.values.warehouse,
        });
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Add a connection"
            size="lg"
            confirmLabel="Add connection"
            onConfirm={handleSubmit}
            confirmLoading={createMutation.isLoading}
            cancelDisabled={createMutation.isLoading}
        >
            <Stack gap="md">
                <ConnectionFields
                    form={form}
                    nameRef={nameRef}
                    projectUuid={projectUuid}
                    warehouseType={warehouseType}
                    intro="Add another warehouse connection to this project. It uses the project's warehouse type, and its name is how people pick it in the SQL runner."
                />
                <TestConnectionAction projectUuid={projectUuid} form={form} />
            </Stack>
        </MantineModal>
    );
};

const EditConnectionModalInner: FC<{
    projectUuid: string;
    connection: Connection;
    credentials: CreateWarehouseCredentials;
    onClose: () => void;
}> = ({ projectUuid, connection, credentials, onClose }) => {
    // The warehouse forms read the stored connection to decide whether a
    // secret must be typed again. Only its credentials matter here.
    const savedProject = { warehouseConnection: credentials } as Project;
    const updateMutation = useUpdateConnection(projectUuid, {
        onSuccess: onClose,
    });
    const form = useForm({
        initialValues: {
            name: connection.name,
            warehouse: credentials,
            ...unusedDbtFormValues,
        },
        validate: {
            name: validateConnectionName,
            warehouse: warehouseValueValidators[connection.warehouseType],
        },
        validateInputOnBlur: true,
    });

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        const { warehouse } = form.values;
        updateMutation.mutate({
            connectionUuid: connection.connectionUuid,
            data: {
                warehouseConnection: omitEmptySecrets(warehouse),
                // The API reads the listing fields from the top level and
                // ignores the copies inside warehouseConnection.
                listAllDatabases: warehouse.listAllDatabases ?? false,
                additionalDatabases: warehouse.additionalDatabases ?? [],
            },
        });
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Edit connection"
            size="lg"
            confirmLabel="Save changes"
            onConfirm={handleSubmit}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="md">
                <ConnectionFields
                    form={form}
                    projectUuid={projectUuid}
                    warehouseType={connection.warehouseType}
                    savedProject={savedProject}
                    intro="Update this connection. Leave a secret blank to keep the saved one."
                />
                <TestConnectionAction projectUuid={projectUuid} form={form} />
            </Stack>
        </MantineModal>
    );
};

const EditConnectionModal: FC<{
    projectUuid: string;
    connection: Connection | null;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const { data, isInitialLoading } = useConnection(
        projectUuid,
        connection?.connectionUuid,
    );

    if (!connection) {
        return null;
    }

    if (isInitialLoading || !data) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title="Edit connection"
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
        <EditConnectionModalInner
            key={connection.connectionUuid}
            projectUuid={projectUuid}
            connection={connection}
            credentials={data.warehouseConnection as CreateWarehouseCredentials}
            onClose={onClose}
        />
    );
};

const RenameConnectionModal: FC<{
    projectUuid: string;
    connection: Connection | null;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const nameRef = useRef<HTMLInputElement>(null);
    const form = useMantineForm({
        initialValues: { name: connection?.name ?? '' },
        validate: { name: validateConnectionName },
    });
    const renameMutation = useRenameConnection(projectUuid, {
        onSuccess: onClose,
        onNameConflict: (message) => {
            form.setFieldError('name', message);
            nameRef.current?.focus();
        },
    });

    if (!connection) return null;

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        renameMutation.mutate({
            connectionUuid: connection.connectionUuid,
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
            <Stack gap="md">
                <TextInput
                    ref={nameRef}
                    label="Name"
                    required
                    maxLength={CONNECTION_NAME_MAX_LENGTH}
                    {...form.getInputProps('name')}
                />
                <Text size="sm" c="dimmed">
                    This is the name people pick in the SQL runner.
                </Text>
            </Stack>
        </MantineModal>
    );
};

const RemoveConnectionModal: FC<{
    projectUuid: string;
    connection: Connection | null;
    onClose: () => void;
}> = ({ projectUuid, connection, onClose }) => {
    const deleteMutation = useDeleteConnection(projectUuid, {
        onSuccess: onClose,
    });

    return (
        <MantineModal
            opened={connection !== null}
            onClose={() => {
                if (deleteMutation.isLoading) return;
                deleteMutation.reset();
                onClose();
            }}
            title="Remove connection"
            variant="delete"
            confirmLabel="Remove"
            confirmLoading={deleteMutation.isLoading}
            cancelDisabled={deleteMutation.isLoading}
            onConfirm={() => {
                if (!connection) return;
                deleteMutation.mutate(connection.connectionUuid);
            }}
        >
            <Stack gap="md">
                <Text>
                    Remove{' '}
                    <Text span fw={600}>
                        {connection?.name}
                    </Text>
                    ? Its databases stop appearing in the SQL runner.
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

const ConnectionsPanel: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isInitialLoading, isError } = useConnections(projectUuid);
    const [connectionToEdit, setConnectionToEdit] = useState<Connection | null>(
        null,
    );
    const [connectionToRename, setConnectionToRename] =
        useState<Connection | null>(null);
    const [connectionToRemove, setConnectionToRemove] =
        useState<Connection | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);

    const connections = data?.connections ?? [];
    const canAddConnection = data?.capabilities.canAddConnection ?? false;
    const addBlockedReason = data?.capabilities.reason;
    // Every connection in a project shares the project's warehouse type.
    const warehouseType = connections[0]?.warehouseType;

    // A project that cannot hold a second connection keeps the single
    // warehouse form instead of this list.
    if (!isInitialLoading && !canAddConnection && connections.length <= 1) {
        return null;
    }

    return (
        <Card shadow="xs" padding="lg" radius="md">
            <Stack gap="md">
                <Group gap={6}>
                    <Title order={5}>Connections</Title>
                    <Tooltip
                        w={300}
                        position="right"
                        label="Warehouse connections this project can query. Each one keeps its own credentials and its own list of databases for the SQL runner."
                    >
                        <ActionIcon size="sm" aria-label="About connections">
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                {isInitialLoading && (
                    <Group justify="center" py="md">
                        <Loader size="sm" />
                    </Group>
                )}

                {isError && (
                    <Text size="sm" c="red">
                        Failed to load connections.
                    </Text>
                )}

                {!isInitialLoading && !isError && (
                    <div className={classes.rows}>
                        {connections.map((connection) => (
                            <ConnectionRow
                                key={connection.connectionUuid}
                                connection={connection}
                                canRemove={connections.length > 1}
                                onEdit={setConnectionToEdit}
                                onRename={setConnectionToRename}
                                onRemove={setConnectionToRemove}
                            />
                        ))}
                    </div>
                )}

                <Group justify="flex-end">
                    <Tooltip
                        w={300}
                        disabled={canAddConnection || !addBlockedReason}
                        label={addBlockedReason}
                    >
                        <div>
                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                disabled={!canAddConnection || !warehouseType}
                                onClick={() => setIsAddOpen(true)}
                            >
                                Add connection
                            </Button>
                        </div>
                    </Tooltip>
                </Group>
            </Stack>

            {warehouseType && (
                <AddConnectionModal
                    projectUuid={projectUuid}
                    warehouseType={warehouseType}
                    opened={isAddOpen}
                    onClose={() => setIsAddOpen(false)}
                />
            )}

            <EditConnectionModal
                projectUuid={projectUuid}
                connection={connectionToEdit}
                onClose={() => setConnectionToEdit(null)}
            />

            <RenameConnectionModal
                key={connectionToRename?.connectionUuid}
                projectUuid={projectUuid}
                connection={connectionToRename}
                onClose={() => setConnectionToRename(null)}
            />

            <RemoveConnectionModal
                key={connectionToRemove?.connectionUuid}
                projectUuid={projectUuid}
                connection={connectionToRemove}
                onClose={() => setConnectionToRemove(null)}
            />
        </Card>
    );
};

export default ConnectionsPanel;

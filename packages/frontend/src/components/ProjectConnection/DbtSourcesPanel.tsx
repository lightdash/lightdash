import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    validateProjectDbtSourceName,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type Connection,
    type DbtProjectConfig,
    type Project,
    type ProjectDbtSourceSummary,
    type WarehouseLocation,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Card,
    Group,
    Loader,
    Menu,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm as useMantineForm } from '@mantine/form';
import {
    IconAlertTriangle,
    IconDots,
    IconInfoCircle,
    IconPencil,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useProject } from '../../hooks/useProject';
import {
    useCreateProjectDbtSourceMutation,
    useDeleteProjectDbtSourceMutation,
    useProjectDbtSource,
    useProjectDbtSources,
    useUpdateProjectDbtSourceMutation,
} from '../../hooks/useProjectDbtSources';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { dbtDefaults } from './DbtForms/defaultValues';
import { dbtFormValidators } from './DbtForms/validators';
import DbtSettingsForm from './DbtSettingsForm';
import classes from './DbtSourcesPanel.module.css';
import { FormProvider, useForm, type Form } from './formContext';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { ProjectFormProvider } from './ProjectFormProvider';

/**
 * The git-backed identity of a source as a single line — `repo · branch ·
 * subfolder`. Falls back to the connection type for non-git sources (also
 * the fallback when the stored connection couldn't be decrypted, since the
 * identity fields are then unavailable too — that case surfaces via the
 * warning icon instead, not this line).
 */
const sourceIdentity = (source: ProjectDbtSourceSummary): string => {
    const location = [
        source.warehouseLocation.database,
        source.warehouseLocation.schema,
    ]
        .filter(Boolean)
        .join('.');
    if (source.repository) {
        return [
            source.repository,
            source.branch,
            source.projectSubPath && source.projectSubPath !== '/'
                ? source.projectSubPath
                : null,
            location || null,
        ]
            .filter(Boolean)
            .join(' · ');
    }
    return source.type ?? 'no connection';
};

/** An empty string means inherit, which the API expresses as null. */
type WarehouseLocationFormValues = {
    database: string;
    schema: string;
};

const toFormLocation = (
    location: WarehouseLocation | undefined,
): WarehouseLocationFormValues => ({
    database: location?.database ?? '',
    schema: location?.schema ?? '',
});

const toApiLocation = (
    values: WarehouseLocationFormValues | undefined,
): WarehouseLocation => ({
    database: values?.database.trim() || null,
    schema: values?.schema.trim() || null,
});

const DbtSourceRow: FC<{
    source: ProjectDbtSourceSummary;
    onEdit: (source: ProjectDbtSourceSummary) => void;
    onRemove?: (source: ProjectDbtSourceSummary) => void;
}> = ({ source, onEdit, onRemove }) => (
    <div className={classes.row}>
        <img className={classes.mark} src={DbtLogo} alt="" />
        <div className={classes.info}>
            <Group gap={6} wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                    {source.name}
                </Text>
                {source.hasCredentialError && (
                    <Tooltip
                        w={260}
                        label="Connection could not be loaded — remove and add it again"
                    >
                        <MantineIcon
                            icon={IconAlertTriangle}
                            color="red"
                            aria-label={`${source.name} connection could not be loaded`}
                        />
                    </Tooltip>
                )}
            </Group>
            <Text className={classes.meta} c="dimmed" truncate>
                {sourceIdentity(source)}
            </Text>
        </div>
        <Menu position="bottom-end">
            <Menu.Target>
                <ActionIcon aria-label={`Actions for ${source.name}`}>
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => onEdit(source)}
                >
                    Edit
                </Menu.Item>
                {onRemove && (
                    <Menu.Item
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={() => onRemove(source)}
                    >
                        Remove
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    </div>
);

/**
 * The shared body for the add/edit modals: a name field plus the full dbt
 * connection form, wrapped in the providers `DbtSettingsForm` reads from.
 */
const DbtSourceFields: FC<{
    form: Form;
    intro: string;
    projectUuid: string;
    connections: Connection[];
    namespaceReadOnly?: boolean;
}> = ({ form, intro, projectUuid, connections, namespaceReadOnly = false }) => (
    <FormProvider form={form}>
        <ProjectFormProvider isDbtSource projectUuid={projectUuid}>
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    {intro}
                </Text>
                <TextInput
                    label="Name"
                    placeholder="e.g. marketing_dbt"
                    required
                    {...form.getInputProps('name')}
                />
                {connections.length > 1 && (
                    <Select
                        label="Connection"
                        data={connections.map((connection) => ({
                            value: connection.connectionUuid,
                            label: connection.name,
                        }))}
                        required
                        {...form.getInputProps('connectionUuid')}
                    />
                )}
                <TextInput
                    label="Namespace prefix"
                    description="Explore names from this source use this prefix."
                    placeholder="Defaults to the source name"
                    readOnly={namespaceReadOnly}
                    {...form.getInputProps('namespacePrefix')}
                />
                <DbtSettingsForm disabled={false} />
            </Stack>
        </ProjectFormProvider>
    </FormProvider>
);

const AddDbtSourceModalInner: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
    connections: Connection[];
}> = ({ projectUuid, opened, onClose, connections }) => {
    const form = useForm({
        initialValues: {
            name: '',
            connectionUuid: connections[0]?.connectionUuid ?? '',
            namespacePrefix: '',
            dbt: { ...dbtDefaults.formValues[DbtProjectType.GITHUB] },
            warehouseLocation: toFormLocation(undefined),
            // Sources share the project's warehouse; the schema input is hidden
            // for sources so this is only here to satisfy the form shape.
            warehouse: {
                type: WarehouseTypes.POSTGRES,
            } as CreateWarehouseCredentials,
            dbtVersion: DefaultSupportedDbtVersion,
        },
        validate: {
            name: (value) => validateProjectDbtSourceName(value.trim()),
            namespacePrefix: (value) =>
                value?.trim()
                    ? validateProjectDbtSourceName(value.trim())
                    : null,
            dbt: dbtFormValidators,
        },
        validateInputOnBlur: true,
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };
    const createMutation = useCreateProjectDbtSourceMutation(projectUuid, {
        onSuccess: handleClose,
    });

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        createMutation.mutate(
            {
                name: form.values.name.trim(),
                connectionUuid: form.values.connectionUuid ?? '',
                namespacePrefix:
                    form.values.namespacePrefix?.trim() ||
                    form.values.name.trim(),
                dbtConnection: form.values.dbt,
                warehouseLocation: toApiLocation(form.values.warehouseLocation),
            },
            { onSuccess: handleClose },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Add a dbt source"
            size="lg"
            confirmLabel="Add source"
            onConfirm={handleSubmit}
            confirmLoading={createMutation.isLoading}
            cancelDisabled={createMutation.isLoading}
        >
            <DbtSourceFields
                form={form}
                projectUuid={projectUuid}
                intro="Connect another git-backed dbt project. Its models are merged with the primary source on every deploy and preview, using the project's warehouse and dbt version."
                connections={connections}
            />
        </MantineModal>
    );
};

const AddDbtSourceModal: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
}> = ({ projectUuid, opened, onClose }) => {
    const { data } = useProject(projectUuid);
    const connections = (
        data as (Project & { connections?: Connection[] }) | undefined
    )?.connections;
    if (!opened || !connections?.length) return null;
    return (
        <AddDbtSourceModalInner
            key={connections.map(({ connectionUuid }) => connectionUuid).join()}
            projectUuid={projectUuid}
            opened
            onClose={onClose}
            connections={connections}
        />
    );
};

const EditDbtSourceModalInner: FC<{
    projectUuid: string;
    source: ProjectDbtSourceSummary;
    connection: DbtProjectConfig | null;
    connections: Connection[];
    onClose: () => void;
}> = ({ projectUuid, source, connection, connections, onClose }) => {
    const updateMutation = useUpdateProjectDbtSourceMutation(projectUuid, {
        onSuccess: onClose,
    });
    const form = useForm({
        initialValues: {
            name: source.name,
            connectionUuid: source.connectionUuid,
            namespacePrefix: source.namespacePrefix,
            dbt: connection ?? {
                ...dbtDefaults.formValues[DbtProjectType.GITHUB],
            },
            warehouseLocation: toFormLocation(source.warehouseLocation),
            warehouse: {
                type: WarehouseTypes.POSTGRES,
            } as CreateWarehouseCredentials,
            dbtVersion: DefaultSupportedDbtVersion,
        },
        validate: {
            name: (value) =>
                value.trim() === source.name
                    ? null
                    : validateProjectDbtSourceName(value.trim()),
            dbt: dbtFormValidators,
        },
        validateInputOnBlur: true,
    });

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        const name = form.values.name.trim();
        updateMutation.mutate(
            {
                projectDbtSourceUuid: source.projectDbtSourceUuid,
                data: {
                    ...(name === source.name ? {} : { name }),
                    ...(form.values.connectionUuid === source.connectionUuid
                        ? {}
                        : { connectionUuid: form.values.connectionUuid }),
                    namespacePrefix: form.values.namespacePrefix,
                    dbtConnection: form.values.dbt,
                    warehouseLocation: toApiLocation(
                        form.values.warehouseLocation,
                    ),
                },
            },
            { onSuccess: onClose },
        );
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Edit dbt source"
            size="lg"
            confirmLabel="Save changes"
            onConfirm={handleSubmit}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <DbtSourceFields
                form={form}
                projectUuid={projectUuid}
                intro="Update this source's connection. Leave the access token blank to keep the saved one."
                connections={connections}
                namespaceReadOnly
            />
        </MantineModal>
    );
};

const EditDbtSourceModal: FC<{
    projectUuid: string;
    source: ProjectDbtSourceSummary | null;
    onClose: () => void;
}> = ({ projectUuid, source, onClose }) => {
    const { data, isInitialLoading } = useProjectDbtSource(
        projectUuid,
        source?.projectDbtSourceUuid,
    );
    const { data: project } = useProject(projectUuid);
    const connections = (
        project as (Project & { connections?: Connection[] }) | undefined
    )?.connections;

    if (!source) {
        return null;
    }

    if (isInitialLoading || !data || !connections) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title="Edit dbt source"
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
        <EditDbtSourceModalInner
            key={source.projectDbtSourceUuid}
            projectUuid={projectUuid}
            source={source}
            connection={data.dbtConnection}
            connections={connections}
            onClose={onClose}
        />
    );
};

const RenamePrimaryDbtSourceModal: FC<{
    projectUuid: string;
    source: ProjectDbtSourceSummary | null;
    onClose: () => void;
}> = ({ projectUuid, source, onClose }) => {
    const updateMutation = useUpdateProjectDbtSourceMutation(projectUuid, {
        onSuccess: onClose,
    });
    const form = useMantineForm({
        initialValues: { name: source?.name ?? '' },
        validate: {
            name: (value) => validateProjectDbtSourceName(value.trim()),
        },
    });

    if (!source) return null;

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        updateMutation.mutate({
            projectDbtSourceUuid: source.projectDbtSourceUuid,
            data: { name: form.values.name.trim() },
        });
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Rename dbt source"
            confirmLabel="Save changes"
            onConfirm={handleSubmit}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="md">
                <TextInput
                    label="Name"
                    required
                    maxLength={64}
                    {...form.getInputProps('name')}
                />
                <Text size="sm" c="dimmed">
                    Renaming this source does not change its explore names.
                </Text>
            </Stack>
        </MantineModal>
    );
};

const DbtSourcesPanel: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.MultiDbtSources);
    const {
        data: sources,
        isInitialLoading,
        isError,
    } = useProjectDbtSources(projectUuid);
    const deleteMutation = useDeleteProjectDbtSourceMutation(projectUuid);
    const [sourceToRemove, setSourceToRemove] =
        useState<ProjectDbtSourceSummary | null>(null);
    const [sourceToEdit, setSourceToEdit] =
        useState<ProjectDbtSourceSummary | null>(null);
    const [primarySourceToRename, setPrimarySourceToRename] =
        useState<ProjectDbtSourceSummary | null>(null);
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Only show the panel when the feature is on.
    if (!flag?.enabled) {
        return null;
    }

    const primarySource = sources?.find((source) => source.isPrimary);
    const additionalSources = (sources ?? []).filter(
        (source) => !source.isPrimary,
    );

    return (
        <Card shadow="xs" padding="lg" radius="md" className={classes.panel}>
            <Badge className={classes.beta} color="violet" size="sm">
                Beta
            </Badge>
            <Stack gap="md">
                <Group gap={6}>
                    <Title order={5}>dbt sources</Title>
                    <Tooltip
                        w={300}
                        position="right"
                        label="Merge models from other git-backed dbt projects. Additional source explores use <prefix>__<name>; the first source's explore names stay unchanged."
                    >
                        <ActionIcon size="sm" aria-label="About dbt sources">
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
                        Failed to load dbt sources.
                    </Text>
                )}

                {!isInitialLoading && !isError && primarySource && (
                    <Stack gap={4}>
                        <Text size="sm" fw={600}>
                            Source name
                        </Text>
                        <div className={classes.rows}>
                            <DbtSourceRow
                                source={primarySource}
                                onEdit={setPrimarySourceToRename}
                            />
                        </div>
                    </Stack>
                )}

                <Text size="sm" fw={600}>
                    Additional dbt sources
                </Text>

                {!isInitialLoading &&
                    !isError &&
                    (additionalSources.length > 0 ? (
                        <div className={classes.rows}>
                            {additionalSources.map((source) => (
                                <DbtSourceRow
                                    key={source.projectDbtSourceUuid}
                                    source={source}
                                    onEdit={setSourceToEdit}
                                    onRemove={setSourceToRemove}
                                />
                            ))}
                        </div>
                    ) : (
                        <Text size="sm" c="dimmed">
                            No additional sources yet. Add one to combine models
                            from another dbt project.
                        </Text>
                    ))}

                <Group justify="flex-end">
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => setIsAddOpen(true)}
                    >
                        Add source
                    </Button>
                </Group>
            </Stack>

            <AddDbtSourceModal
                projectUuid={projectUuid}
                opened={isAddOpen}
                onClose={() => setIsAddOpen(false)}
            />

            <EditDbtSourceModal
                projectUuid={projectUuid}
                source={sourceToEdit}
                onClose={() => setSourceToEdit(null)}
            />

            <RenamePrimaryDbtSourceModal
                key={primarySourceToRename?.projectDbtSourceUuid}
                projectUuid={projectUuid}
                source={primarySourceToRename}
                onClose={() => setPrimarySourceToRename(null)}
            />

            <MantineModal
                opened={sourceToRemove !== null}
                onClose={() =>
                    !deleteMutation.isLoading && setSourceToRemove(null)
                }
                title="Remove dbt source"
                variant="delete"
                confirmLabel="Remove"
                confirmLoading={deleteMutation.isLoading}
                cancelDisabled={deleteMutation.isLoading}
                onConfirm={() => {
                    if (!sourceToRemove) return;
                    deleteMutation.mutate(sourceToRemove.projectDbtSourceUuid, {
                        onSuccess: () => setSourceToRemove(null),
                    });
                }}
            >
                <Text>
                    Remove{' '}
                    <Text span fw={600}>
                        {sourceToRemove?.name}
                    </Text>
                    ? Its models will drop from this project on the next deploy.
                </Text>
            </MantineModal>
        </Card>
    );
};

export default DbtSourcesPanel;

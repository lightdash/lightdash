import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
    type ProjectDbtSourceSummary,
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
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconDots,
    IconInfoCircle,
    IconPencil,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
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
    if (source.repository) {
        return [
            source.repository,
            source.branch,
            source.projectSubPath && source.projectSubPath !== '/'
                ? source.projectSubPath
                : null,
        ]
            .filter(Boolean)
            .join(' · ');
    }
    return source.type ?? 'no connection';
};

const DbtSourceRow: FC<{
    source: ProjectDbtSourceSummary;
    onEdit: (source: ProjectDbtSourceSummary) => void;
    onRemove: (source: ProjectDbtSourceSummary) => void;
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
                        multiline
                        w={260}
                        withinPortal
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
        <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={`Actions for ${source.name}`}
                >
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
                <Menu.Item
                    color="red"
                    leftSection={<MantineIcon icon={IconTrash} />}
                    onClick={() => onRemove(source)}
                >
                    Remove
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    </div>
);

/**
 * The shared body for the add/edit modals: a name field plus the full dbt
 * connection form, wrapped in the providers `DbtSettingsForm` reads from.
 */
const DbtSourceFields: FC<{ form: Form; intro: string }> = ({
    form,
    intro,
}) => (
    <FormProvider form={form}>
        <ProjectFormProvider isDbtSource>
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    {intro}
                </Text>
                <TextInput
                    label="Name"
                    placeholder="e.g. marketing-dbt"
                    required
                    {...form.getInputProps('name')}
                />
                <DbtSettingsForm disabled={false} />
            </Stack>
        </ProjectFormProvider>
    </FormProvider>
);

const AddDbtSourceModal: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
}> = ({ projectUuid, opened, onClose }) => {
    const createMutation = useCreateProjectDbtSourceMutation(projectUuid);
    const form = useForm({
        initialValues: {
            name: '',
            dbt: { ...dbtDefaults.formValues[DbtProjectType.GITHUB] },
            // Sources share the project's warehouse; the schema input is hidden
            // for sources so this is only here to satisfy the form shape.
            warehouse: {
                type: WarehouseTypes.POSTGRES,
            } as CreateWarehouseCredentials,
            dbtVersion: DefaultSupportedDbtVersion,
        },
        validate: {
            name: (value) => (value.trim() ? null : 'Name is required'),
            dbt: dbtFormValidators,
        },
        validateInputOnBlur: true,
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        createMutation.mutate(
            {
                name: form.values.name.trim(),
                dbtConnection: form.values.dbt,
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
                intro="Connect another git-backed dbt project. Its models are merged with the primary source on every deploy and preview, using the project's warehouse and dbt version."
            />
        </MantineModal>
    );
};

const EditDbtSourceModalInner: FC<{
    projectUuid: string;
    source: ProjectDbtSourceSummary;
    connection: DbtProjectConfig | null;
    onClose: () => void;
}> = ({ projectUuid, source, connection, onClose }) => {
    const updateMutation = useUpdateProjectDbtSourceMutation(projectUuid);
    const form = useForm({
        initialValues: {
            name: source.name,
            dbt: connection ?? {
                ...dbtDefaults.formValues[DbtProjectType.GITHUB],
            },
            warehouse: {
                type: WarehouseTypes.POSTGRES,
            } as CreateWarehouseCredentials,
            dbtVersion: DefaultSupportedDbtVersion,
        },
        validate: {
            name: (value) => (value.trim() ? null : 'Name is required'),
            dbt: dbtFormValidators,
        },
        validateInputOnBlur: true,
    });

    const handleSubmit = () => {
        const { hasErrors } = form.validate();
        if (hasErrors) return;
        updateMutation.mutate(
            {
                projectDbtSourceUuid: source.projectDbtSourceUuid,
                data: {
                    name: form.values.name.trim(),
                    dbtConnection: form.values.dbt,
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
                intro="Update this source's connection. Leave the access token blank to keep the saved one."
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

    if (!source) {
        return null;
    }

    if (isInitialLoading || !data) {
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
            onClose={onClose}
        />
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
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Only show the panel when the feature is on.
    if (!flag?.enabled) {
        return null;
    }

    // The primary source is the project's own dbt connection, shown in the card
    // directly above — list only the additional sources here.
    const additionalSources = (sources ?? []).filter((s) => !s.isPrimary);

    return (
        <Card
            withBorder
            shadow="xs"
            padding="lg"
            radius="md"
            className={classes.panel}
        >
            <Badge
                className={classes.beta}
                variant="light"
                color="violet"
                size="sm"
            >
                Beta
            </Badge>
            <Stack gap="md">
                <Group gap={6}>
                    <Title order={5}>Additional dbt sources</Title>
                    <Tooltip
                        multiline
                        w={300}
                        withinPortal
                        position="right"
                        label="Merge models from other git-backed dbt projects. They're combined with this project's dbt connection on every deploy and preview — if a name clashes between sources, the deploy fails until you rename or remove the duplicate."
                    >
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="About additional dbt sources"
                        >
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

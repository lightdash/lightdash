import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    validateProjectDbtSourceName,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
    type DbtSourceBindings,
    type Project,
    type ProjectDbtSourceSummary,
    type PeerDbtSourceSummary,
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
import { useState, type FC, type ReactNode } from 'react';
import { useDbtSourceBindings } from '../../hooks/useDbtSourceBindings';
import { useMixedWarehouseConnectionsEnabled } from '../../hooks/useExploreWarehouseConnection';
import { usePeerDbtSourceAccess } from '../../hooks/usePeerDbtSources';
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
import {
    DbtSourceConnectionSelect,
    DbtSourceReboundNote,
    PrimaryDbtSourceConnection,
    type ReboundDbtSource,
} from './DbtSourceConnection';
import classes from './DbtSourcesPanel.module.css';
import { FormProvider, useForm, type Form } from './formContext';
import {
    AddSharedDbtSourceModal,
    PeerDbtSourceMetadata,
    PeerDbtSourceSettingsModal,
} from './PeerDbtSourceSettings';
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
    connection?: ReactNode;
    peerSource?: PeerDbtSourceSummary;
    onPeerSettings?: (source: PeerDbtSourceSummary) => void;
    canEdit?: boolean;
    canManage?: boolean;
}> = ({
    source,
    onEdit,
    onRemove,
    connection,
    peerSource,
    onPeerSettings,
    canEdit = true,
    canManage = true,
}) => (
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
            {peerSource && <PeerDbtSourceMetadata peer={peerSource.peer} />}
        </div>
        {connection}
        <Menu position="bottom-end">
            <Menu.Target>
                <ActionIcon aria-label={`Actions for ${source.name}`}>
                    <MantineIcon icon={IconDots} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                {canEdit && (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => onEdit(source)}
                        disabled={!canManage}
                    >
                        Edit
                    </Menu.Item>
                )}
                {peerSource && onPeerSettings && (
                    <Menu.Item onClick={() => onPeerSettings(peerSource)}>
                        dbt settings
                    </Menu.Item>
                )}
                {onRemove && (
                    <Menu.Item
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={() => onRemove(source)}
                        disabled={!canManage}
                    >
                        Remove
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    </div>
);

const AdditionalDbtSourceRows: FC<{
    sources: ProjectDbtSourceSummary[];
    projectUuid: string;
    peerAccess: ReturnType<typeof usePeerDbtSourceAccess>;
    bindings: DbtSourceBindings | undefined;
    onEdit: (source: ProjectDbtSourceSummary) => void;
    onRemove: (source: ProjectDbtSourceSummary) => void;
    onPeerSettings: (source: PeerDbtSourceSummary) => void;
    onRebound: (rebound: ReboundDbtSource) => void;
}> = ({
    sources,
    projectUuid,
    peerAccess,
    bindings,
    onEdit,
    onRemove,
    onPeerSettings,
    onRebound,
}) => {
    const {
        enabled: peerEnabled,
        peersByUuid,
        isError: peerError,
        canManage,
    } = peerAccess;
    return sources.length > 0 ? (
        <div className={classes.rows}>
            {sources.map((source) => {
                const peerSource = peersByUuid.get(source.projectDbtSourceUuid);
                const hasLocalCredentials =
                    peerSource !== undefined &&
                    !peerSource.peer.usesSharedCredentials;
                return (
                    <DbtSourceRow
                        key={source.projectDbtSourceUuid}
                        source={source}
                        onEdit={onEdit}
                        onRemove={onRemove}
                        canManage={canManage}
                        peerSource={peerSource}
                        onPeerSettings={onPeerSettings}
                        canEdit={
                            !peerEnabled || (!peerError && hasLocalCredentials)
                        }
                        connection={
                            bindings && (
                                <DbtSourceConnectionSelect
                                    projectUuid={projectUuid}
                                    source={source}
                                    bindings={bindings}
                                    onRebound={onRebound}
                                    disabled={!canManage}
                                />
                            )
                        }
                    />
                );
            })}
        </div>
    ) : (
        <Text size="sm" c="dimmed">
            No additional sources yet. Add one to combine models from another
            dbt project.
        </Text>
    );
};

const DbtSourceRows: FC<{
    sources: ProjectDbtSourceSummary[] | undefined;
    isInitialLoading: boolean;
    isError: boolean;
    projectUuid: string;
    peerAccess: ReturnType<typeof usePeerDbtSourceAccess>;
    bindings: DbtSourceBindings | undefined;
    onRenamePrimary: (source: ProjectDbtSourceSummary) => void;
    onEdit: (source: ProjectDbtSourceSummary) => void;
    onRemove: (source: ProjectDbtSourceSummary) => void;
    onPeerSettings: (source: PeerDbtSourceSummary) => void;
    onRebound: (rebound: ReboundDbtSource) => void;
}> = ({
    sources,
    isInitialLoading,
    isError,
    projectUuid,
    peerAccess,
    bindings,
    onRenamePrimary,
    onEdit,
    onRemove,
    onPeerSettings,
    onRebound,
}) => {
    const {
        enabled: peerEnabled,
        peersByUuid,
        isError: peerError,
        canManage,
    } = peerAccess;
    const primarySource = sources?.find((source) => source.isPrimary);
    const additionalSources = (sources ?? []).filter(
        (source) => !source.isPrimary,
    );
    return (
        <>
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

            {peerEnabled && peerError && (
                <Text size="sm" c="red">
                    Failed to load dbt source settings.
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
                            onEdit={onRenamePrimary}
                            canManage={canManage}
                            peerSource={
                                additionalSources.length > 0
                                    ? peersByUuid.get(
                                          primarySource.projectDbtSourceUuid,
                                      )
                                    : undefined
                            }
                            onPeerSettings={onPeerSettings}
                            connection={
                                bindings && (
                                    <PrimaryDbtSourceConnection
                                        bindings={bindings}
                                    />
                                )
                            }
                        />
                    </div>
                </Stack>
            )}

            <Text size="sm" fw={600}>
                Additional dbt sources
            </Text>

            {!isInitialLoading && !isError && (
                <AdditionalDbtSourceRows
                    sources={additionalSources}
                    projectUuid={projectUuid}
                    peerAccess={peerAccess}
                    bindings={bindings}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onPeerSettings={onPeerSettings}
                    onRebound={onRebound}
                />
            )}
        </>
    );
};

/**
 * The shared body for the add/edit modals: a name field plus the full dbt
 * connection form, wrapped in the providers `DbtSettingsForm` reads from.
 */
const DbtSourceFields: FC<{
    form: Form;
    intro: string;
    projectUuid: string;
    dbtSourceWarehouseConnectionUuid?: string | null;
}> = ({ form, intro, projectUuid, dbtSourceWarehouseConnectionUuid }) => (
    <FormProvider form={form}>
        <ProjectFormProvider
            isDbtSource
            projectUuid={projectUuid}
            dbtSourceWarehouseConnectionUuid={dbtSourceWarehouseConnectionUuid}
        >
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
                <DbtSettingsForm disabled={false} />
            </Stack>
        </ProjectFormProvider>
    </FormProvider>
);

const AddDbtSourceModal: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
    onAddShared?: () => void;
}> = ({ projectUuid, opened, onClose, onAddShared }) => {
    const form = useForm({
        initialValues: {
            name: '',
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
            {onAddShared && (
                <Button variant="subtle" onClick={onAddShared}>
                    Add a shared source instead
                </Button>
            )}
            <DbtSourceFields
                form={form}
                projectUuid={projectUuid}
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
    const updateMutation = useUpdateProjectDbtSourceMutation(projectUuid, {
        onSuccess: onClose,
    });
    const mixedWarehouseConnectionsEnabled =
        useMixedWarehouseConnectionsEnabled();
    const { data: bindings } = useDbtSourceBindings(
        projectUuid,
        mixedWarehouseConnectionsEnabled,
    );
    const dbtSourceWarehouseConnectionUuid =
        bindings?.sources.find(
            (binding) =>
                binding.projectDbtSourceUuid === source.projectDbtSourceUuid,
        )?.warehouseConnectionUuid ?? null;
    const form = useForm({
        initialValues: {
            name: source.name,
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
                dbtSourceWarehouseConnectionUuid={
                    dbtSourceWarehouseConnectionUuid
                }
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
                    Renaming this source changes qualified explore names on the
                    next deploy.
                </Text>
            </Stack>
        </MantineModal>
    );
};

const DbtSourcesPanel: FC<{
    project: Pick<Project, 'projectUuid' | 'connectionRoute'>;
}> = ({ project }) => {
    const { projectUuid } = project;
    const { data: flag } = useServerFeatureFlag(FeatureFlags.MultiDbtSources);
    const peerAccess = usePeerDbtSourceAccess(
        projectUuid,
        flag?.enabled === true,
    );
    const { enabled: peerEnabled, peersByUuid, canManage } = peerAccess;
    const { data: bindings } = useDbtSourceBindings(
        projectUuid,
        flag?.enabled === true && project.connectionRoute === 'multi',
    );
    const [rebound, setRebound] = useState<ReboundDbtSource | null>(null);
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
    const [isAddSharedOpen, setIsAddSharedOpen] = useState(false);
    const [peerToEdit, setPeerToEdit] = useState<PeerDbtSourceSummary | null>(
        null,
    );

    // Only show the panel when the feature is on.
    if (!flag?.enabled) {
        return null;
    }

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
                        label="Merge models from other git-backed dbt projects. They're combined with this project's dbt connection on every deploy. If a model or metric name exists in more than one source, each one is renamed to <source>__<name>."
                    >
                        <ActionIcon size="sm" aria-label="About dbt sources">
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <DbtSourceRows
                    sources={sources}
                    isInitialLoading={isInitialLoading}
                    isError={isError}
                    projectUuid={projectUuid}
                    peerAccess={peerAccess}
                    bindings={bindings}
                    onRenamePrimary={setPrimarySourceToRename}
                    onEdit={setSourceToEdit}
                    onRemove={setSourceToRemove}
                    onPeerSettings={setPeerToEdit}
                    onRebound={setRebound}
                />

                {rebound && (
                    <DbtSourceReboundNote
                        rebound={rebound}
                        onDismiss={() => setRebound(null)}
                    />
                )}

                <Group justify="flex-end">
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => setIsAddOpen(true)}
                        disabled={!canManage}
                    >
                        Add source
                    </Button>
                </Group>
            </Stack>

            <AddDbtSourceModal
                projectUuid={projectUuid}
                opened={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onAddShared={
                    peerEnabled && canManage
                        ? () => {
                              setIsAddOpen(false);
                              setIsAddSharedOpen(true);
                          }
                        : undefined
                }
            />

            {peerEnabled && canManage && isAddSharedOpen && (
                <AddSharedDbtSourceModal
                    projectUuid={projectUuid}
                    bindings={bindings}
                    onClose={() => setIsAddSharedOpen(false)}
                />
            )}

            {peerEnabled && peerToEdit && (
                <PeerDbtSourceSettingsModal
                    key={peerToEdit.projectDbtSourceUuid}
                    projectUuid={projectUuid}
                    source={
                        peersByUuid.get(peerToEdit.projectDbtSourceUuid) ??
                        peerToEdit
                    }
                    canManage={canManage}
                    onClose={() => setPeerToEdit(null)}
                />
            )}

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

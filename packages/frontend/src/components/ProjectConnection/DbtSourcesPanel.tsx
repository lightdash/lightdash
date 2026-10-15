import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    validateProjectDbtSourceName,
    WarehouseTypes,
    type CreateWarehouseCredentials,
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
import { type TFunction } from 'i18next';
import { useState, type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDbtSourceBindings } from '../../hooks/useDbtSourceBindings';
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
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { ProjectFormProvider } from './ProjectFormProvider';

/**
 * The git-backed identity of a source as a single line — `repo · branch ·
 * subfolder`. Falls back to the connection type for non-git sources (also
 * the fallback when the stored connection couldn't be decrypted, since the
 * identity fields are then unavailable too — that case surfaces via the
 * warning icon instead, not this line).
 */
const sourceIdentity = (
    t: TFunction,
    source: ProjectDbtSourceSummary,
): string => {
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
    return source.type ?? t('dbtSourcesPanel.noConnection');
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
}> = ({ source, onEdit, onRemove, connection }) => {
    const { t } = useTranslation('projectConnection');
    return (
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
                            label={t('dbtSourcesPanel.credentialErrorTooltip')}
                        >
                            <MantineIcon
                                icon={IconAlertTriangle}
                                color="red"
                                aria-label={t(
                                    'dbtSourcesPanel.credentialErrorAriaLabel',
                                    {
                                        name: source.name,
                                    },
                                )}
                            />
                        </Tooltip>
                    )}
                </Group>
                <Text className={classes.meta} c="dimmed" truncate>
                    {sourceIdentity(t, source)}
                </Text>
            </div>
            {connection}
            <Menu position="bottom-end">
                <Menu.Target>
                    <ActionIcon
                        aria-label={t('connectionsPanel.actionsFor', {
                            name: source.name,
                        })}
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => onEdit(source)}
                    >
                        {t('actions.edit', { ns: 'common' })}
                    </Menu.Item>
                    {onRemove && (
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() => onRemove(source)}
                        >
                            {t('actions.remove', { ns: 'common' })}
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>
        </div>
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
}> = ({ form, intro, projectUuid }) => {
    const { t } = useTranslation('projectConnection');
    return (
        <FormProvider form={form}>
            <ProjectFormProvider isDbtSource projectUuid={projectUuid}>
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {intro}
                    </Text>
                    <TextInput
                        label={t('connectionFields.nameLabel')}
                        placeholder={t('dbtSourcesPanel.namePlaceholder')}
                        required
                        {...form.getInputProps('name')}
                    />
                    <DbtSettingsForm disabled={false} />
                </Stack>
            </ProjectFormProvider>
        </FormProvider>
    );
};

const AddDbtSourceModal: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
}> = ({ projectUuid, opened, onClose }) => {
    const { t } = useTranslation('projectConnection');
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
            title={t('dbtSourcesPanel.addTitle')}
            size="lg"
            confirmLabel={t('dbtSourcesPanel.addSource')}
            onConfirm={handleSubmit}
            confirmLoading={createMutation.isLoading}
            cancelDisabled={createMutation.isLoading}
        >
            <DbtSourceFields
                form={form}
                projectUuid={projectUuid}
                intro={t('dbtSourcesPanel.addIntro')}
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
    const { t } = useTranslation('projectConnection');
    const updateMutation = useUpdateProjectDbtSourceMutation(projectUuid, {
        onSuccess: onClose,
    });
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
            title={t('dbtSourcesPanel.editTitle')}
            size="lg"
            confirmLabel={t('connectionsPanel.saveChanges')}
            onConfirm={handleSubmit}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <DbtSourceFields
                form={form}
                projectUuid={projectUuid}
                intro={t('dbtSourcesPanel.editIntro')}
            />
        </MantineModal>
    );
};

const EditDbtSourceModal: FC<{
    projectUuid: string;
    source: ProjectDbtSourceSummary | null;
    onClose: () => void;
}> = ({ projectUuid, source, onClose }) => {
    const { t } = useTranslation('projectConnection');
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
                title={t('dbtSourcesPanel.editTitle')}
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
    const { t } = useTranslation('projectConnection');
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
            title={t('dbtSourcesPanel.renameTitle')}
            confirmLabel={t('connectionsPanel.saveChanges')}
            onConfirm={handleSubmit}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="md">
                <TextInput
                    label={t('connectionFields.nameLabel')}
                    required
                    maxLength={64}
                    {...form.getInputProps('name')}
                />
                <Text size="sm" c="dimmed">
                    {t('dbtSourcesPanel.renameHint')}
                </Text>
            </Stack>
        </MantineModal>
    );
};

const DbtSourcesPanel: FC<{
    project: Pick<Project, 'projectUuid' | 'connectionRoute'>;
}> = ({ project }) => {
    const { t } = useTranslation('projectConnection');
    const { projectUuid } = project;
    const { data: flag } = useServerFeatureFlag(FeatureFlags.MultiDbtSources);
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
                {t('dbtSourcesPanel.beta')}
            </Badge>
            <Stack gap="md">
                <Group gap={6}>
                    <Title order={5}>{t('dbtSourcesPanel.title')}</Title>
                    <Tooltip
                        w={300}
                        position="right"
                        label={t('dbtSourcesPanel.about')}
                    >
                        <ActionIcon
                            size="sm"
                            aria-label={t('dbtSourcesPanel.aboutAriaLabel')}
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
                        {t('dbtSourcesPanel.loadFailed')}
                    </Text>
                )}

                {!isInitialLoading && !isError && primarySource && (
                    <Stack gap={4}>
                        <Text size="sm" fw={600}>
                            {t('dbtSourcesPanel.sourceName')}
                        </Text>
                        <div className={classes.rows}>
                            <DbtSourceRow
                                source={primarySource}
                                onEdit={setPrimarySourceToRename}
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
                    {t('dbtSourcesPanel.additional')}
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
                                    connection={
                                        bindings && (
                                            <DbtSourceConnectionSelect
                                                projectUuid={projectUuid}
                                                source={source}
                                                bindings={bindings}
                                                onRebound={setRebound}
                                            />
                                        )
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <Text size="sm" c="dimmed">
                            {t('dbtSourcesPanel.empty')}
                        </Text>
                    ))}

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
                    >
                        {t('dbtSourcesPanel.addSource')}
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
                title={t('dbtSourcesPanel.removeTitle')}
                variant="delete"
                confirmLabel={t('actions.remove', { ns: 'common' })}
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
                    <Trans
                        t={t}
                        i18nKey="dbtSourcesPanel.removeConfirm"
                        values={{ name: sourceToRemove?.name }}
                        components={{ name: <Text span fw={600} /> }}
                    />
                </Text>
            </MantineModal>
        </Card>
    );
};

export default DbtSourcesPanel;

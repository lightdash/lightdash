import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Card,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconDatabase, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    useCreateProjectDbtSourceMutation,
    useDeleteProjectDbtSourceMutation,
    useProjectDbtSources,
} from '../../hooks/useProjectDbtSources';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../common/MantineIcon';
import { dbtDefaults } from './DbtForms/defaultValues';
import { dbtFormValidators } from './DbtForms/validators';
import DbtSettingsForm from './DbtSettingsForm';
import { FormProvider, useForm } from './formContext';
import { ProjectFormProvider } from './ProjectFormProvider';

const DbtSourceRow: FC<{
    source: ProjectDbtSourceSummary;
    onRemove: (source: ProjectDbtSourceSummary) => void;
    isRemoving: boolean;
}> = ({ source, onRemove, isRemoving }) => (
    <Card withBorder padding="sm">
        <Group position="apart">
            <Group spacing="sm">
                <MantineIcon icon={IconDatabase} />
                <div>
                    <Text fw={500}>{source.name}</Text>
                    <Text size="xs" color="dimmed">
                        {source.type ?? 'no connection'}
                    </Text>
                </div>
                {source.isPrimary && (
                    <Tooltip
                        withinPortal
                        label="Models from this source win on name conflicts"
                    >
                        <Badge variant="light" color="gray">
                            Wins conflicts
                        </Badge>
                    </Tooltip>
                )}
            </Group>
            {!source.isPrimary && (
                <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconTrash} />}
                    loading={isRemoving}
                    onClick={() => onRemove(source)}
                >
                    Remove
                </Button>
            )}
        </Group>
    </Card>
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

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title="Add a dbt source"
            size="lg"
        >
            <FormProvider form={form}>
                <ProjectFormProvider isDbtSource>
                    <form
                        onSubmit={form.onSubmit((values) => {
                            createMutation.mutate(
                                {
                                    name: values.name.trim(),
                                    dbtConnection: values.dbt,
                                },
                                { onSuccess: handleClose },
                            );
                        })}
                    >
                        <Stack spacing="md">
                            <Text size="sm" color="dimmed">
                                Connect another git-backed dbt project. Its
                                models are merged with the primary source on
                                every deploy and preview, using the project's
                                warehouse and dbt version.
                            </Text>
                            <TextInput
                                label="Name"
                                placeholder="e.g. marketing-dbt"
                                required
                                {...form.getInputProps('name')}
                            />
                            <DbtSettingsForm disabled={false} />
                            <Group position="right" mt="sm">
                                <Button variant="default" onClick={handleClose}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    loading={createMutation.isLoading}
                                >
                                    Add source
                                </Button>
                            </Group>
                        </Stack>
                    </form>
                </ProjectFormProvider>
            </FormProvider>
        </Modal>
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
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Only show the panel when the feature is on.
    if (!flag?.enabled) {
        return null;
    }

    return (
        <Card withBorder shadow="xs" padding="lg">
            <Stack spacing="md">
                <Group position="apart" align="flex-start">
                    <div>
                        <Title order={5}>Additional dbt sources</Title>
                        <Text size="sm" color="dimmed">
                            Connect more dbt projects to this Lightdash project.
                            Their models are merged with the primary source on
                            every deploy and preview.
                        </Text>
                    </div>
                    <Button
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        onClick={() => setIsAddOpen(true)}
                    >
                        Add source
                    </Button>
                </Group>

                {isInitialLoading && (
                    <Group position="center" py="md">
                        <Loader size="sm" />
                    </Group>
                )}

                {isError && (
                    <Text size="sm" color="red">
                        Failed to load dbt sources.
                    </Text>
                )}

                {!isInitialLoading && !isError && (
                    <Stack spacing="xs">
                        {(sources ?? []).map((source) => (
                            <DbtSourceRow
                                key={source.projectDbtSourceUuid}
                                source={source}
                                onRemove={setSourceToRemove}
                                isRemoving={
                                    deleteMutation.isLoading &&
                                    deleteMutation.variables ===
                                        source.projectDbtSourceUuid
                                }
                            />
                        ))}
                        {sources && sources.length <= 1 && (
                            <Text size="sm" color="dimmed">
                                No additional sources yet. Add one to combine
                                models from another dbt project.
                            </Text>
                        )}
                    </Stack>
                )}
            </Stack>

            <AddDbtSourceModal
                projectUuid={projectUuid}
                opened={isAddOpen}
                onClose={() => setIsAddOpen(false)}
            />

            <Modal
                opened={sourceToRemove !== null}
                onClose={() => setSourceToRemove(null)}
                title="Remove dbt source"
            >
                <Stack spacing="md">
                    <Text>
                        Remove <b>{sourceToRemove?.name}</b>? Its models will
                        drop from this project on the next deploy.
                    </Text>
                    <Group position="right">
                        <Button
                            variant="default"
                            onClick={() => setSourceToRemove(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            loading={deleteMutation.isLoading}
                            onClick={() => {
                                if (!sourceToRemove) return;
                                deleteMutation.mutate(
                                    sourceToRemove.projectDbtSourceUuid,
                                    {
                                        onSuccess: () =>
                                            setSourceToRemove(null),
                                    },
                                );
                            }}
                        >
                            Remove
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
};

export default DbtSourcesPanel;

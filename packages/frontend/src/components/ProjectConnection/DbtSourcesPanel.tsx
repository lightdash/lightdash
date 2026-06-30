import {
    DbtProjectType,
    FeatureFlags,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Card,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconDatabase, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    useCreateProjectDbtSourceMutation,
    useDeleteProjectDbtSourceMutation,
    useProjectDbtSources,
} from '../../hooks/useProjectDbtSources';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../common/MantineIcon';

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
                {source.isPrimary && <Badge color="blue">Primary</Badge>}
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
            repository: '',
            branch: 'main',
            projectSubPath: '/',
        },
        validate: {
            name: (value) => (value.trim() ? null : 'Name is required'),
            repository: (value) =>
                /^[^/\s]+\/[^/\s]+$/.test(value.trim())
                    ? null
                    : 'Use the form owner/repository',
        },
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };

    return (
        <Modal opened={opened} onClose={handleClose} title="Add a dbt source">
            <form
                onSubmit={form.onSubmit((values) => {
                    createMutation.mutate(
                        {
                            name: values.name.trim(),
                            dbtConnection: {
                                type: DbtProjectType.GITHUB,
                                authorization_method: 'installation_id',
                                repository: values.repository.trim(),
                                branch: values.branch.trim(),
                                project_sub_path: values.projectSubPath.trim(),
                            },
                        },
                        { onSuccess: handleClose },
                    );
                })}
            >
                <Stack spacing="md">
                    <Text size="sm" color="dimmed">
                        Connect a GitHub dbt project. It uses this
                        organization's GitHub App installation.
                    </Text>
                    <TextInput
                        label="Name"
                        placeholder="e.g. marketing-dbt"
                        required
                        {...form.getInputProps('name')}
                    />
                    <TextInput
                        label="Repository"
                        placeholder="owner/repository"
                        required
                        {...form.getInputProps('repository')}
                    />
                    <TextInput
                        label="Branch"
                        required
                        {...form.getInputProps('branch')}
                    />
                    <TextInput
                        label="Project subdirectory"
                        {...form.getInputProps('projectSubPath')}
                    />
                    <Group position="right">
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
        </Modal>
    );
};

const DbtSourcesPanel: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.MultiDbtSources);
    const { data: sources } = useProjectDbtSources(projectUuid);
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
                </Stack>
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

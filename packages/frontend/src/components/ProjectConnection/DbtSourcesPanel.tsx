import { FeatureFlags, type ProjectDbtSourceSummary } from '@lightdash/common';
import {
    Badge,
    Button,
    Card,
    Group,
    Modal,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconDatabase, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
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

const DbtSourcesPanel: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.MultiDbtSources);
    const { data: sources } = useProjectDbtSources(projectUuid);
    const deleteMutation = useDeleteProjectDbtSourceMutation(projectUuid);
    const [sourceToRemove, setSourceToRemove] =
        useState<ProjectDbtSourceSummary | null>(null);

    // N=0 short-circuit on the UI: only show the panel when the feature is on.
    if (!flag?.enabled) {
        return null;
    }

    return (
        <Card withBorder shadow="xs" padding="lg">
            <Stack spacing="md">
                <div>
                    <Title order={5}>Additional dbt sources</Title>
                    <Text size="sm" color="dimmed">
                        Connect more dbt projects to this Lightdash project.
                        Their models are merged with the primary source on every
                        deploy and preview.
                    </Text>
                </div>

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

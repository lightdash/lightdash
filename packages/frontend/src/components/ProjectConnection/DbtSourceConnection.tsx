import {
    JobStatusType,
    type DbtSourceBindings,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useBindDbtSource } from '../../hooks/useDbtSourceBindings';
import { useJob, useRefreshServer } from '../../hooks/useRefreshServer';
import MantineIcon from '../common/MantineIcon';

export type ReboundDbtSource = {
    sourceName: string;
    connectionName: string;
};

const originalConnectionOf = (bindings: DbtSourceBindings) =>
    bindings.connections.find((connection) => connection.isOriginal);

export const PrimaryDbtSourceConnection: FC<{
    bindings: DbtSourceBindings;
}> = ({ bindings }) => (
    <Text size="xs" c="dimmed">
        Always runs on {originalConnectionOf(bindings)?.name}
    </Text>
);

export const DbtSourceConnectionSelect: FC<{
    projectUuid: string;
    source: ProjectDbtSourceSummary;
    bindings: DbtSourceBindings;
    onRebound: (rebound: ReboundDbtSource) => void;
}> = ({ projectUuid, source, bindings, onRebound }) => {
    const bindMutation = useBindDbtSource(projectUuid);
    const boundConnectionUuid =
        bindings.sources.find(
            (binding) =>
                binding.projectDbtSourceUuid === source.projectDbtSourceUuid,
        )?.warehouseConnectionUuid ?? null;
    const selectedConnectionUuid =
        boundConnectionUuid ??
        originalConnectionOf(bindings)?.warehouseConnectionUuid ??
        null;

    const handleChange = (warehouseConnectionUuid: string | null) => {
        const connection = bindings.connections.find(
            (candidate) =>
                candidate.warehouseConnectionUuid === warehouseConnectionUuid,
        );
        if (
            !connection ||
            connection.warehouseConnectionUuid === selectedConnectionUuid
        ) {
            return;
        }
        bindMutation.mutate(
            {
                projectDbtSourceUuid: source.projectDbtSourceUuid,
                warehouseConnectionUuid: connection.isOriginal
                    ? null
                    : connection.warehouseConnectionUuid,
            },
            {
                onSuccess: () =>
                    onRebound({
                        sourceName: source.name,
                        connectionName: connection.name,
                    }),
            },
        );
    };

    return (
        <Stack gap={2}>
            <Select
                size="xs"
                w={200}
                aria-label={`Connection for ${source.name}`}
                data={bindings.connections.map((connection) => ({
                    value: connection.warehouseConnectionUuid,
                    label: connection.name,
                }))}
                value={selectedConnectionUuid}
                onChange={handleChange}
                allowDeselect={false}
                disabled={bindMutation.isLoading}
            />
            {bindMutation.error && (
                <Text size="xs" c="red" w={200}>
                    {bindMutation.error.error.message}
                </Text>
            )}
        </Stack>
    );
};

export const DbtSourceReboundNote: FC<{
    rebound: ReboundDbtSource;
    onDismiss: () => void;
}> = ({ rebound, onDismiss }) => {
    const { mutate: compile, isLoading } = useRefreshServer();
    const [compileJobUuid, setCompileJobUuid] = useState<string>();
    useJob(
        compileJobUuid,
        (job) => {
            if (job.jobStatus === JobStatusType.DONE) onDismiss();
        },
        () => undefined,
    );
    return (
        <Alert
            color="blue"
            icon={<MantineIcon icon={IconInfoCircle} />}
            withCloseButton
            onClose={onDismiss}
        >
            <Stack gap="xs">
                <Text size="sm">
                    {rebound.sourceName} now runs on {rebound.connectionName}.
                    Its explores move to {rebound.connectionName} on the next
                    compile. Until then they keep running on the old connection.
                </Text>
                <Group>
                    <Button
                        size="xs"
                        variant="default"
                        loading={isLoading}
                        onClick={() =>
                            compile(
                                { syncContent: false },
                                {
                                    onSuccess: (result) =>
                                        setCompileJobUuid(result.jobUuid),
                                },
                            )
                        }
                    >
                        Compile now
                    </Button>
                </Group>
            </Stack>
        </Alert>
    );
};

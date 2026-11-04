import {
    type ExternalSourceRef,
    type ExternalSourceTable,
} from '@lightdash/common';
import { Button, Group, Loader, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import {
    useExternalSource,
    useRenameExternalSource,
} from '../hooks/useExternalSources';
import { initialColumnLabels } from '../utils/columnLabels';
import { ColumnNamesTable } from './ColumnNamesTable';

type Props = {
    projectUuid: string;
    sourceRef: ExternalSourceRef;
    currentLabel: string;
    opened: boolean;
    onClose: () => void;
};

type RenameFormProps = {
    projectUuid: string;
    sourceUuid: string;
    currentLabel: string;
    table: ExternalSourceTable | undefined;
    onClose: () => void;
};

const RenameForm: FC<RenameFormProps> = ({
    projectUuid,
    sourceUuid,
    currentLabel,
    table,
    onClose,
}) => {
    const renameMutation = useRenameExternalSource(projectUuid);
    const columns = table?.columns ? Object.values(table.columns) : [];
    const form = useForm({
        initialValues: {
            label: currentLabel,
            columnLabels: table?.columns
                ? initialColumnLabels(table.columns)
                : {},
        },
        validate: {
            label: (value) =>
                value.trim().length === 0 ? 'Give the table a name' : null,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        renameMutation.mutate(
            {
                sourceUuid,
                payload: {
                    label: values.label.trim(),
                    columnLabels: values.columnLabels,
                },
            },
            { onSuccess: onClose },
        );
    });

    return (
        <form id="external-source-rename-form" onSubmit={handleSubmit}>
            <Stack gap="md">
                <TextInput
                    label="Name"
                    data-autofocus
                    {...form.getInputProps('label')}
                />
                {columns.length > 0 && (
                    <ColumnNamesTable
                        columns={columns}
                        getInputProps={(reference) =>
                            form.getInputProps(`columnLabels.${reference}`)
                        }
                    />
                )}
                <Text fz="xs" c="dimmed">
                    Renaming changes how the table and its fields appear;
                    existing charts keep working.
                </Text>
                <Group justify="flex-end">
                    <Button type="button" variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="external-source-rename-form"
                        loading={renameMutation.isLoading}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

export const RenameExternalSourceModal: FC<Props> = ({
    projectUuid,
    sourceRef,
    currentLabel,
    opened,
    onClose,
}) => {
    const { data: source, isFetchedAfterMount } = useExternalSource(
        projectUuid,
        sourceRef.sourceUuid,
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Rename table"
            icon={IconPencil}
            size="lg"
        >
            {/* Cached columns can predate a rename, so the form waits for a fresh read */}
            {!isFetchedAfterMount ? (
                <Group justify="center" py="lg">
                    <Loader size="sm" />
                </Group>
            ) : (
                <RenameForm
                    projectUuid={projectUuid}
                    sourceUuid={sourceRef.sourceUuid}
                    currentLabel={currentLabel}
                    table={source?.tables.find(
                        (candidate) =>
                            candidate.tableUuid === sourceRef.tableUuid,
                    )}
                    onClose={onClose}
                />
            )}
        </MantineModal>
    );
};

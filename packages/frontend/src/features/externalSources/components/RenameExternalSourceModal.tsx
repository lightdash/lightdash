import { type ExternalSourceRef } from '@lightdash/common';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useRenameExternalSource } from '../hooks/useExternalSources';

type Props = {
    projectUuid: string;
    sourceRef: ExternalSourceRef;
    currentLabel: string;
    opened: boolean;
    onClose: () => void;
};

export const RenameExternalSourceModal: FC<Props> = ({
    projectUuid,
    sourceRef,
    currentLabel,
    opened,
    onClose,
}) => {
    const renameMutation = useRenameExternalSource(projectUuid);
    const form = useForm({
        initialValues: { label: currentLabel },
        validate: {
            label: (value) =>
                value.trim().length === 0 ? 'Give the table a name' : null,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        renameMutation.mutate(
            {
                sourceUuid: sourceRef.sourceUuid,
                payload: { label: values.label.trim() },
            },
            { onSuccess: onClose },
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Rename table"
            icon={IconPencil}
            size="md"
        >
            <form id="external-source-rename-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        label="Name"
                        data-autofocus
                        {...form.getInputProps('label')}
                    />
                    <Text fz="xs" c="dimmed">
                        Renaming changes how the table appears; existing charts
                        keep working.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            type="button"
                            variant="default"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="external-source-rename-form"
                            loading={renameMutation.isLoading}
                        >
                            Rename
                        </Button>
                    </Group>
                </Stack>
            </form>
        </MantineModal>
    );
};

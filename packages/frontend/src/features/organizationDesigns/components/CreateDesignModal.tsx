import { type ApiOrganizationDesign } from '@lightdash/common';
import { Stack, Textarea, TextInput } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateOrganizationDesign } from '../hooks/useOrganizationDesigns';

type Props = {
    opened: boolean;
    onClose: () => void;
    onCreated: (design: ApiOrganizationDesign) => void;
};

export const CreateDesignModal: FC<Props> = ({
    opened,
    onClose,
    onCreated,
}) => {
    const form = useForm({
        initialValues: { name: '', description: '' },
    });
    const createDesign = useCreateOrganizationDesign();

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const trimmedName = form.values.name.trim();
    const trimmedDescription = form.values.description.trim();
    const canSubmit = trimmedName.length > 0 && !createDesign.isLoading;

    const handleSubmit = () => {
        if (!canSubmit) return;
        createDesign.mutate(
            {
                name: trimmedName,
                description: trimmedDescription || undefined,
            },
            {
                onSuccess: (created) => {
                    form.reset();
                    onCreated(created);
                },
            },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Create new theme"
            size="md"
            onConfirm={handleSubmit}
            confirmLabel="Create theme"
            confirmDisabled={!canSubmit}
            confirmLoading={createDesign.isLoading}
        >
            <Stack gap="md">
                <TextInput
                    label="Name"
                    placeholder="Acme brand"
                    required
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                <Textarea
                    label="Description"
                    placeholder="Optional — what this theme is for"
                    minRows={2}
                    autosize
                    {...form.getInputProps('description')}
                />
            </Stack>
        </MantineModal>
    );
};

import { type ApiOrganizationDesign } from '@lightdash/common';
import { Stack, Textarea, TextInput } from '@mantine-8/core';
import { useEffect, useState, type FC } from 'react';
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
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const createDesign = useCreateOrganizationDesign();

    // Reset form whenever the modal is freshly opened.
    useEffect(() => {
        if (opened) {
            setName('');
            setDescription('');
        }
    }, [opened]);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const canSubmit = trimmedName.length > 0 && !createDesign.isLoading;

    const handleSubmit = () => {
        if (!canSubmit) return;
        createDesign.mutate(
            {
                name: trimmedName,
                description: trimmedDescription || undefined,
            },
            {
                onSuccess: (created) => onCreated(created),
            },
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
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
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    required
                    data-autofocus
                />
                <Textarea
                    label="Description"
                    placeholder="Optional — what this theme is for"
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                    minRows={2}
                    autosize
                />
            </Stack>
        </MantineModal>
    );
};

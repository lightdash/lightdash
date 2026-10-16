import { type ApiOrganizationDesign } from '@lightdash/common';
import { Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('settings');
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
            title={t('designs.create.title')}
            size="md"
            onConfirm={handleSubmit}
            confirmLabel={t('designs.create.confirm')}
            confirmDisabled={!canSubmit}
            confirmLoading={createDesign.isLoading}
        >
            <Stack gap="md">
                <TextInput
                    label={t('designs.create.nameLabel')}
                    placeholder={t('designs.create.namePlaceholder')}
                    required
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                <Textarea
                    label={t('designs.create.descriptionLabel')}
                    placeholder={t('designs.create.descriptionPlaceholder')}
                    minRows={2}
                    autosize
                    {...form.getInputProps('description')}
                />
            </Stack>
        </MantineModal>
    );
};

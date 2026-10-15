import { type ExternalSourceRef } from '@lightdash/common';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('sync');
    const renameMutation = useRenameExternalSource(projectUuid);
    const form = useForm({
        initialValues: { label: currentLabel },
        validate: {
            label: (value) =>
                value.trim().length === 0
                    ? t('externalSources.rename.nameRequired')
                    : null,
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
            title={t('externalSources.rename.title')}
            icon={IconPencil}
            size="md"
        >
            <form id="external-source-rename-form" onSubmit={handleSubmit}>
                <Stack gap="md">
                    <TextInput
                        label={t('externalSources.rename.nameLabel')}
                        data-autofocus
                        {...form.getInputProps('label')}
                    />
                    <Text fz="xs" c="dimmed">
                        {t('externalSources.rename.hint')}
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            type="button"
                            variant="default"
                            onClick={onClose}
                        >
                            {t('actions.cancel', { ns: 'common' })}
                        </Button>
                        <Button
                            type="submit"
                            form="external-source-rename-form"
                            loading={renameMutation.isLoading}
                        >
                            {t('externalSources.rename.submit')}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </MantineModal>
    );
};

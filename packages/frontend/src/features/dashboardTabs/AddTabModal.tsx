import { Button, Stack, TextInput, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../components/common/MantineModal';

type AddProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    onConfirm: (tabName: string) => void;
};

export const AddTabModal: FC<AddProps> = ({ opened, onClose, onConfirm }) => {
    const { t } = useTranslation('dashboard');
    const form = useForm<{ tabName: string }>();

    const handleConfirm = form.onSubmit(({ tabName }) => {
        onConfirm(tabName);
        form.reset();
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={t('tabs.addModal.title')}
            icon={IconPlus}
            size="sm"
            actions={
                <Button
                    type="submit"
                    form="add-tab-form"
                    disabled={!form.isValid()}
                >
                    {t('actions.add', { ns: 'common' })}
                </Button>
            }
        >
            <form id="add-tab-form" onSubmit={handleConfirm}>
                <Stack gap="md">
                    <TextInput
                        label={t('tabs.tabName')}
                        placeholder={t('tabs.tabNamePlaceholder')}
                        data-autofocus
                        required
                        {...form.getInputProps('tabName')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

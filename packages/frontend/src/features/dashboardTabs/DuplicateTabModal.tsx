import { type DashboardTab } from '@lightdash/common';
import { Button, TextInput, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import MantineModal from '../../components/common/MantineModal';

type DuplicateTabModalProps = ModalProps & {
    tab: DashboardTab;
    onConfirm: (name: string) => void;
};

const DuplicateTabModal: FC<DuplicateTabModalProps> = ({
    opened,
    onClose,
    tab,
    onConfirm,
}) => {
    const { t } = useTranslation('dashboard');
    const formSchema = z.object({
        name: z
            .string()
            .trim()
            .min(1, { message: t('tabs.duplicateModal.nameRequired') })
            .max(255, { message: t('tabs.duplicateModal.nameTooLong') }),
    });

    const form = useForm<{ name: string }>({
        initialValues: {
            name: t('tabs.duplicateModal.copyOf', { name: tab.name }),
        },
        validate: zodResolver(formSchema),
        validateInputOnChange: true,
        validateInputOnBlur: true,
    });

    const handleConfirm = form.onSubmit(({ name }) => {
        onConfirm(name.trim());
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
            title={t('tabs.duplicateModal.title')}
            icon={IconCopy}
            size="sm"
            actions={
                <Button
                    type="submit"
                    form="duplicate-tab-form"
                    disabled={!form.isValid()}
                >
                    {t('tabs.duplicateModal.confirm')}
                </Button>
            }
        >
            <form id="duplicate-tab-form" onSubmit={handleConfirm}>
                <TextInput
                    label={t('tabs.tabName')}
                    required
                    placeholder={t('tabs.duplicateModal.copyOf', {
                        name: tab.name,
                    })}
                    data-autofocus
                    {...form.getInputProps('name')}
                />
            </form>
        </MantineModal>
    );
};

export default DuplicateTabModal;

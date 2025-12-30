import { type DashboardTab } from '@lightdash/common';
import { Button, TextInput, type ModalProps } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
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
    const formSchema = z.object({
        name: z
            .string()
            .trim()
            .min(1, { message: 'Tab name is required' })
            .max(255, { message: 'Tab name must be at most 255 characters' }),
    });

    const form = useForm<{ name: string }>({
        initialValues: { name: `Copy of ${tab.name}` },
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
            title="Duplicate Tab"
            icon={IconCopy}
            size="sm"
            actions={
                <Button
                    type="submit"
                    form="duplicate-tab-form"
                    disabled={!form.isValid()}
                >
                    Create duplicate
                </Button>
            }
        >
            <form id="duplicate-tab-form" onSubmit={handleConfirm}>
                <TextInput
                    label="Tab name"
                    required
                    placeholder={`Copy of ${tab.name}`}
                    data-autofocus
                    {...form.getInputProps('name')}
                />
            </form>
        </MantineModal>
    );
};

export default DuplicateTabModal;

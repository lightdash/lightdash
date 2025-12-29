import { Button, Stack, TextInput, type ModalProps } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../components/common/MantineModal';

type AddProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    onConfirm: (tabName: string) => void;
};

export const AddTabModal: FC<AddProps> = ({ opened, onClose, onConfirm }) => {
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
            title="Add new tab"
            icon={IconPlus}
            size="sm"
            actions={
                <Button
                    type="submit"
                    form="add-tab-form"
                    disabled={!form.isValid()}
                >
                    Add
                </Button>
            }
        >
            <form id="add-tab-form" onSubmit={handleConfirm}>
                <Stack gap="md">
                    <TextInput
                        label="Tab name"
                        placeholder="Name your tab"
                        data-autofocus
                        required
                        {...form.getInputProps('tabName')}
                    />
                </Stack>
            </form>
        </MantineModal>
    );
};

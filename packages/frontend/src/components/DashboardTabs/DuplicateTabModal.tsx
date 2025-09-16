import { type DashboardTab } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';

type DuplicateTabModalProps = ModalProps & {
    tab: DashboardTab;
    onConfirm: (name: string) => void;
};

const DuplicateTabModal: FC<DuplicateTabModalProps> = ({
    tab,
    onConfirm,
    onClose,
    ...modalProps
}) => {
    const form = useForm<{ name: string }>();

    const handleConfirm = form.onSubmit(({ name }) => {
        onConfirm(name);
        form.reset();
    });

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <Title order={4}>Duplicate Tab</Title>
                </Group>
            }
            {...modalProps}
            size="sm"
            onClose={handleClose}
        >
            <form onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label="Tab name"
                        required
                        placeholder={`Copy of ${tab.name}`}
                        defaultValue={`Copy of ${tab.name}`}
                        data-autofocus
                        {...form.getInputProps('name')}
                    />

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            Create duplicate
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default DuplicateTabModal; 
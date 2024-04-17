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

type AddProps = ModalProps & {
    onConfirm: (tabName: string) => void;
};

export const TabAddModal: FC<AddProps> = ({
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const form = useForm<{ tabName: string }>();

    const handleConfirm = form.onSubmit(({ ...tabProps }) => {
        onConfirm(tabProps.tabName);
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
                    <Title order={4}>Add new tab</Title>
                </Group>
            }
            {...modalProps}
            size="xl"
            onClose={handleClose}
        >
            <form onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label="Tab name"
                        placeholder="Name your tab"
                        required
                        {...form.getInputProps('tabName')}
                    ></TextInput>
                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            Add
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

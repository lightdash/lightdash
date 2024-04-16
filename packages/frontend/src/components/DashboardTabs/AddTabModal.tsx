import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, type FC } from 'react';

type AddProps = ModalProps & {
    onConfirm: (tabName: string) => void;
};

export const TabAddModal: FC<AddProps> = ({
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const [_, setErrorMessage] = useState<string>();

    const getValidators = () => {
        const tabNameValidator = {
            tabName: (value: string | undefined) =>
                !value || !value.length ? 'Required field' : null,
        };
        return tabNameValidator;
    };

    const form = useForm<{ tabName: string }>({
        validate: getValidators(),
        validateInputOnChange: ['tabName'],
    });

    const handleConfirm = form.onSubmit(({ ...tabProps }) => {
        onConfirm(tabProps.tabName);
        form.reset();
        setErrorMessage('');
    });

    const handleClose = () => {
        form.reset();
        setErrorMessage('');
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
                    <Text>Name your tab</Text>
                    <TextInput
                        placeholder="tab name"
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

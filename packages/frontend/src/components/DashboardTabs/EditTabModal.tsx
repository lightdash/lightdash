import { type DashboardTab } from '@lightdash/common';
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
    tab: DashboardTab | undefined;
    onConfirm: (tabName: string, tabUuid: string) => void;
};

export const TabEditModal: FC<AddProps> = ({
    tab,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const [_, setErrorMessage] = useState<string>();

    const getValidators = () => {
        const tabNameValidator = {
            newTabName: (value: string | undefined) =>
                !value || !value.length ? 'Required field' : null,
        };
        return tabNameValidator;
    };

    const form = useForm<{ newTabName: string }>({
        validate: getValidators(),
        validateInputOnChange: ['newTabName'],
    });

    const handleConfirm = form.onSubmit(({ ...tabProps }) => {
        onConfirm(tabProps.newTabName, tab?.uuid ? tab.uuid : '');
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
                    <Title order={4}>Edit your tab</Title>
                </Group>
            }
            {...modalProps}
            size="xl"
            onClose={handleClose}
        >
            <form onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <Text>New tab name</Text>
                    <TextInput
                        placeholder={tab?.name}
                        {...form.getInputProps('newTabName')}
                    ></TextInput>
                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            Update
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

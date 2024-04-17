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

type AddProps = ModalProps & {
    tab: DashboardTab;
    onConfirm: (tabName: string, tabUuid: string) => void;
};

export const TabEditModal: FC<AddProps> = ({
    tab,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const form = useForm<{ newTabName: string }>();

    const handleConfirm = form.onSubmit(({ ...tabProps }) => {
        onConfirm(tabProps.newTabName, tab.uuid);
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
                    <Title order={4}>Edit your tab</Title>
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

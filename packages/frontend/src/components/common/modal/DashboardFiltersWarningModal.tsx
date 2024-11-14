import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { type FC } from 'react';

interface DashboardFiltersWarningModalProps extends ModalProps {
    onConfirm?: () => void;
}

const DashboardFiltersWarningModal: FC<DashboardFiltersWarningModalProps> = ({
    onConfirm,
    ...modalProps
}) => {
    return (
        <Modal withCloseButton={false} {...modalProps}>
            <Stack pt="sm">
                <Text>
                    Your current filter values do not match the defaults for
                    this dashboard. Do you want to discard your filter changes
                    and edit the dashboard?
                </Text>

                <Group position="right" mt="sm">
                    <Button
                        color="dark"
                        variant="outline"
                        onClick={modalProps.onClose}
                    >
                        Cancel
                    </Button>

                    <Button color="red" onClick={onConfirm}>
                        Yes
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default DashboardFiltersWarningModal;

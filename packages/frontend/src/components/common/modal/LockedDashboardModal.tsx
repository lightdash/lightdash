import { Modal, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './LockedDashboardModal.module.css';

interface LockedDashboardModalProps {
    opened: boolean;
}

export const LockedDashboardModal: FC<LockedDashboardModalProps> = ({
    opened,
}) => (
    <Modal
        opened={opened}
        lockScroll={false}
        withCloseButton={false}
        centered
        withinPortal
        withOverlay={false}
        onClose={() => {}}
        classNames={{
            content: classes.content,
        }}
    >
        <Text fw={600} fz="lg" ta="center" mb="lg">
            Set filter values to get started
        </Text>
        <Stack gap="xs">
            <Text>
                This dashboard cannot be run without setting the filter values
                that are required
            </Text>
        </Stack>
    </Modal>
);

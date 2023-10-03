import { Code, Modal, Text } from '@mantine/core';
import React, { FC } from 'react';
import SchedulersModalContent from './SchedulerModalContent';

// TODO: rename when replacement is complete
const SchedulersModal2: FC<
    Omit<React.ComponentProps<typeof SchedulersModalContent>, 'onClose'> & {
        name: string;
        onClose?: () => void;
    }
> = ({ isOpen, onClose = () => {} }) => {
    return (
        <Modal opened={isOpen} onClose={onClose}>
            <Text mb="xl">
                This feature isn't ready yet. Paste this in your browser console
                to use Scheduled Deliveries:
            </Text>

            <Code>localStorage.clear('scheduler-modal-2')</Code>
        </Modal>
    );
};

export default SchedulersModal2;

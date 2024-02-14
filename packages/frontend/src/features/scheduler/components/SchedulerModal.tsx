import { Group, Modal, Text } from '@mantine/core';
import { IconFlag, IconSend } from '@tabler/icons-react';
import React, { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SchedulerModalContent from './SchedulerModalContent';

const SchedulersModal: FC<
    Omit<React.ComponentProps<typeof SchedulerModalContent>, 'onClose'> & {
        name: string;
        onClose?: () => void;
        isOpen?: boolean;
        isAlert?: boolean;
    }
> = ({
    resourceUuid,
    schedulersQuery,
    createMutation,
    isOpen = false,
    isChart,
    isAlert,
    onClose = () => {},
}) => {
    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            size="lg"
            yOffset={65}
            title={
                isAlert ? (
                    <Group spacing="xs">
                        <MantineIcon icon={IconFlag} size="lg" color="gray.7" />
                        <Text fw={600}>Threshold alerts</Text>
                    </Group>
                ) : (
                    <Group spacing="xs">
                        <MantineIcon icon={IconSend} size="lg" color="gray.7" />
                        <Text fw={600}>Scheduled deliveries</Text>
                    </Group>
                )
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <SchedulerModalContent
                resourceUuid={resourceUuid}
                schedulersQuery={schedulersQuery}
                createMutation={createMutation}
                onClose={onClose}
                isChart={isChart}
                isAlert={isAlert}
            />
        </Modal>
    );
};

export default SchedulersModal;

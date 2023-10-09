import { Group, Modal, Text } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import React, { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SchedulerModalContent2 from './SchedulerModalContent2';

// TODO: rename when replacement is complete
const SchedulersModal2: FC<
    Omit<React.ComponentProps<typeof SchedulerModalContent2>, 'onClose'> & {
        name: string;
        onClose?: () => void;
        isOpen?: boolean;
    }
> = ({
    resourceUuid,
    schedulersQuery,
    createMutation,
    isOpen = false,
    isChart,
    onClose = () => {},
}) => {
    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            size="lg"
            yOffset={65}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconSend} size="lg" color="gray.7" />
                    <Text fw={600}>Scheduled deliveries</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <SchedulerModalContent2
                resourceUuid={resourceUuid}
                schedulersQuery={schedulersQuery}
                createMutation={createMutation}
                onClose={onClose}
                isChart={isChart}
            />
        </Modal>
    );
};

export default SchedulersModal2;

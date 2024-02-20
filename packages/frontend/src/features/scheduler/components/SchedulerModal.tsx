import { ItemsMap } from '@lightdash/common';
import { Group, Modal, Text } from '@mantine/core';
import { IconBell, IconSend } from '@tabler/icons-react';
import React, { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SchedulerModalContent from './SchedulerModalContent';

const SchedulersModal: FC<
    Omit<React.ComponentProps<typeof SchedulerModalContent>, 'onClose'> & {
        name: string;
        onClose?: () => void;
        isOpen?: boolean;
        isAlert?: boolean;
        itemsMap?: ItemsMap;
    }
> = ({
    resourceUuid,
    schedulersQuery,
    createMutation,
    isOpen = false,
    isChart,
    isAlert,
    itemsMap,
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
                        <MantineIcon icon={IconBell} size="lg" color="gray.7" />
                        <Text fw={600}>Alerts</Text>
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
                itemsMap={itemsMap}
            />
        </Modal>
    );
};

export default SchedulersModal;

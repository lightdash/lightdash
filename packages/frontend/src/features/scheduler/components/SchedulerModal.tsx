import { type ItemsMap } from '@lightdash/common';
import { Group, Modal, Text } from '@mantine/core';
import { IconBell, IconSend } from '@tabler/icons-react';
import React, { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import { useApp } from '../../../providers/AppProvider';
import SchedulerModalContent from './SchedulerModalContent';

const SchedulersModal: FC<
    Omit<React.ComponentProps<typeof SchedulerModalContent>, 'onClose'> & {
        name: string;
        onClose?: () => void;
        isOpen?: boolean;
        isThresholdAlert?: boolean;
        itemsMap?: ItemsMap;
    }
> = ({
    resourceUuid,
    schedulersQuery,
    createMutation,
    isOpen = false,
    isChart,
    isThresholdAlert,
    itemsMap,
    onClose = () => {},
}) => {
    const { health } = useApp();
    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            size="lg"
            yOffset={65}
            title={
                isThresholdAlert ? (
                    <Group spacing="xs">
                        <MantineIcon icon={IconBell} size="lg" color="gray.7" />
                        <Text fw={600}>Alerts</Text>
                        <DocumentationHelpButton
                            href={`${health.data?.siteHelpdeskUrl}/guides/how-to-create-alerts`}
                            pos="relative"
                            top="2px"
                        />
                    </Group>
                ) : (
                    <Group spacing="xs">
                        <MantineIcon icon={IconSend} size="lg" color="gray.7" />
                        <Text fw={600}>Scheduled deliveries</Text>
                        <DocumentationHelpButton
                            href={`${health.data?.siteHelpdeskUrl}/guides/how-to-create-scheduled-deliveries`}
                            pos="relative"
                            top="2px"
                        />
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
                isThresholdAlert={isThresholdAlert}
                itemsMap={itemsMap}
            />
        </Modal>
    );
};

export default SchedulersModal;

import { type ItemsMap } from '@lightdash/common';
import { Group, Modal, Text } from '@mantine/core';
import { IconBell, IconSend } from '@tabler/icons-react';
import React, { type FC } from 'react';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import MantineIcon from '../../../components/common/MantineIcon';
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
    currentParameterValues,
    availableParameters,
    onClose = () => {},
}) => {
    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            size="xl"
            yOffset={65}
            title={
                isThresholdAlert ? (
                    <Group spacing="xs">
                        <MantineIcon
                            icon={IconBell}
                            size="lg"
                            color="ldGray.7"
                        />
                        <Text fw={600}>Alerts</Text>
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/guides/how-to-create-alerts"
                            pos="relative"
                            top="2px"
                        />
                    </Group>
                ) : (
                    <Group spacing="xs">
                        <MantineIcon
                            icon={IconSend}
                            size="lg"
                            color="ldGray.7"
                        />
                        <Text fw={600}>Scheduled deliveries</Text>
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/guides/how-to-create-scheduled-deliveries"
                            pos="relative"
                            top="2px"
                        />
                    </Group>
                )
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.ldGray[4]}` },
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
                currentParameterValues={currentParameterValues}
                availableParameters={availableParameters}
            />
        </Modal>
    );
};

export default SchedulersModal;

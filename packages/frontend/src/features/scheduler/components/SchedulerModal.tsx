import { type ItemsMap } from '@lightdash/common';
import { IconBell, IconSend } from '@tabler/icons-react';
import React, { type FC } from 'react';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import MantineModal from '../../../components/common/MantineModal';
import SchedulerModalContent from './SchedulerModalContent';

const SchedulersModal: FC<
    React.ComponentProps<typeof SchedulerModalContent> & {
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
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            size="xl"
            title={isThresholdAlert ? 'Alerts' : 'Scheduled deliveries'}
            icon={isThresholdAlert ? IconBell : IconSend}
            headerActions={
                <DocumentationHelpButton
                    href={
                        isThresholdAlert
                            ? 'https://docs.lightdash.com/guides/how-to-create-alerts'
                            : 'https://docs.lightdash.com/guides/how-to-create-scheduled-deliveries'
                    }
                    pos="relative"
                    top="2px"
                />
            }
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0, bg: 'ldGray.0' }}
        >
            <SchedulerModalContent
                resourceUuid={resourceUuid}
                schedulersQuery={schedulersQuery}
                createMutation={createMutation}
                isChart={isChart}
                isThresholdAlert={isThresholdAlert}
                itemsMap={itemsMap}
                currentParameterValues={currentParameterValues}
                availableParameters={availableParameters}
            />
        </MantineModal>
    );
};

export default SchedulersModal;

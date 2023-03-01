import { Dialog } from '@blueprintjs/core';
import React, { FC } from 'react';
import { ModalTitle } from './SchedulerModalBase.styles';
import SchedulersModalContent from './SchedulerModalContent';

const SchedulersModalBase: FC<
    { name: string } & React.ComponentProps<typeof SchedulersModalContent>
> = ({
    resourceUuid,
    name,
    schedulersQuery,
    createMutation,
    ...modalProps
}) => {
    return (
        <Dialog
            lazy
            title={<ModalTitle>Scheduled deliveries</ModalTitle>}
            icon="send-message"
            style={{
                minHeight: '300px',
                minWidth: '500px',
            }}
            {...modalProps}
        >
            <SchedulersModalContent
                resourceUuid={resourceUuid}
                schedulersQuery={schedulersQuery}
                createMutation={createMutation}
                {...modalProps}
            />
        </Dialog>
    );
};

export default SchedulersModalBase;

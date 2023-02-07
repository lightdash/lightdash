import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import React, { FC, useMemo } from 'react';
import { useGetSlack } from '../../../hooks/useSlack';
import { hasRequiredScopes } from '../../UserSettings/SlackSettingsPanel';
import SchedulersModalContent from './SchedulerModalContent';
import SchedulerModalError from './SchedulerModalError';

enum States {
    LOADING,
    SUCCESS,
    ERROR,
}

const SchedulersModalBase: FC<
    { name: string } & React.ComponentProps<typeof SchedulersModalContent>
> = ({
    resourceUuid,
    name,
    schedulersQuery,
    createMutation,
    ...modalProps
}) => {
    const slackQuery = useGetSlack();
    const state = useMemo(() => {
        if (slackQuery.isLoading) {
            return States.LOADING;
        } else {
            const isValidSlack =
                slackQuery.data?.slackTeamName !== undefined &&
                !slackQuery.isError &&
                hasRequiredScopes(slackQuery.data);
            return isValidSlack ? States.SUCCESS : States.ERROR;
        }
    }, [slackQuery]);

    return (
        <Dialog
            lazy
            title={
                <>
                    Scheduled deliveries for <b>"{name}"</b>
                </>
            }
            icon="send-message"
            style={{
                minHeight: '400px',
                minWidth: '500px',
            }}
            {...modalProps}
        >
            {state === States.LOADING && (
                <>
                    <DialogBody>
                        <NonIdealState title="Loading..." icon={<Spinner />} />
                    </DialogBody>
                    <DialogFooter
                        actions={
                            <>
                                <Button onClick={modalProps.onClose}>
                                    Back
                                </Button>
                            </>
                        }
                    />
                </>
            )}
            {state === States.SUCCESS && (
                <SchedulersModalContent
                    resourceUuid={resourceUuid}
                    schedulersQuery={schedulersQuery}
                    createMutation={createMutation}
                    {...modalProps}
                />
            )}
            {state === States.ERROR && (
                <SchedulerModalError
                    slackSettings={slackQuery.data}
                    onClose={modalProps.onClose}
                />
            )}
        </Dialog>
    );
};

export default SchedulersModalBase;

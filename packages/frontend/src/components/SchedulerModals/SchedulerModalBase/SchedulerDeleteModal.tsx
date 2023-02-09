import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import React, { FC, useCallback, useEffect } from 'react';
import { useScheduler } from '../../../hooks/scheduler/useScheduler';
import { useSchedulersDeleteMutation } from '../../../hooks/scheduler/useSchedulersDeleteMutation';
import ErrorState from '../../common/ErrorState';

interface DashboardDeleteModalProps extends DialogProps {
    schedulerUuid: string;
    onConfirm: () => void;
}

const SchedulerDeleteModal: FC<DashboardDeleteModalProps> = ({
    schedulerUuid,
    onConfirm,
    ...modalProps
}) => {
    const scheduler = useScheduler(schedulerUuid);
    const mutation = useSchedulersDeleteMutation();
    useEffect(() => {
        if (mutation.isSuccess) {
            onConfirm();
        }
    }, [mutation.isSuccess, onConfirm]);

    const handleConfirm = useCallback(() => {
        mutation.mutate(schedulerUuid);
    }, [mutation, schedulerUuid]);

    return (
        <Dialog
            lazy
            title="Delete scheduled delivery"
            icon="trash"
            {...modalProps}
        >
            <DialogBody>
                {scheduler.isLoading || scheduler.error ? (
                    <>
                        {scheduler.isLoading ? (
                            <NonIdealState
                                title="Loading scheduler"
                                icon={<Spinner />}
                            />
                        ) : (
                            <ErrorState error={scheduler.error.error} />
                        )}
                    </>
                ) : (
                    <p>
                        Are you sure you want to delete{' '}
                        <b>"{scheduler.data?.name}"</b>?
                    </p>
                )}
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button onClick={modalProps.onClose}>Cancel</Button>

                        {scheduler.isSuccess && (
                            <Button
                                loading={mutation.isLoading}
                                intent="danger"
                                onClick={handleConfirm}
                            >
                                Delete
                            </Button>
                        )}
                    </>
                }
            />
        </Dialog>
    );
};

export default SchedulerDeleteModal;

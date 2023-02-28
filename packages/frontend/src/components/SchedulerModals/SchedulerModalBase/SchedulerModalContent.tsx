import {
    Button,
    DialogBody,
    DialogFooter,
    DialogProps,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import {
    ApiError,
    CreateSchedulerAndTargetsWithoutIds,
    SchedulerAndTargets,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
    UseMutationResult,
    UseQueryResult,
} from 'react-query/types/react/types';
import { useHistory, useLocation } from 'react-router-dom';
import { useScheduler } from '../../../hooks/scheduler/useScheduler';
import { useSchedulersUpdateMutation } from '../../../hooks/scheduler/useSchedulersUpdateMutation';
import ErrorState from '../../common/ErrorState';
import SchedulerForm from './SchedulerForm';
import SchedulersList from './SchedulersList';

enum States {
    LIST,
    CREATE,
    EDIT,
}

const ListStateContent: FC<{
    schedulersQuery: UseQueryResult<SchedulerAndTargets[], ApiError>;
    onClose: DialogProps['onClose'];
    onConfirm: () => void;
    onEdit: (schedulerUuid: string) => void;
}> = ({ schedulersQuery, onClose, onConfirm, onEdit }) => {
    return (
        <>
            <DialogBody>
                <SchedulersList
                    schedulersQuery={schedulersQuery}
                    onEdit={onEdit}
                />
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button intent="primary" onClick={onConfirm}>
                            Create new
                        </Button>
                    </>
                }
            />
        </>
    );
};

const CreateStateContent: FC<{
    resourceUuid: string;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    onBack: () => void;
}> = ({ resourceUuid, createMutation, onBack }) => {
    const methods = useForm<CreateSchedulerAndTargetsWithoutIds>({
        mode: 'onSubmit',
        defaultValues: {
            targets: [],
        },
    });
    useEffect(() => {
        if (createMutation.isSuccess) {
            createMutation.reset();
            onBack();
        }
    }, [createMutation, createMutation.isSuccess, onBack]);
    const handleSubmit = (data: CreateSchedulerAndTargetsWithoutIds) => {
        createMutation.mutate({ resourceUuid, data });
    };
    return (
        <>
            <DialogBody>
                <SchedulerForm
                    disabled={createMutation.isLoading}
                    methods={methods}
                />
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onBack}>Back</Button>
                        <Button
                            intent="primary"
                            loading={createMutation.isLoading}
                            onClick={methods.handleSubmit(handleSubmit)}
                        >
                            Create schedule
                        </Button>
                    </>
                }
            />
        </>
    );
};

const UpdateStateContent: FC<{
    schedulerUuid: string;
    onBack: () => void;
}> = ({ schedulerUuid, onBack }) => {
    const scheduler = useScheduler(schedulerUuid);
    const methods = useForm<UpdateSchedulerAndTargetsWithoutId>({
        mode: 'onSubmit',
        defaultValues: scheduler.data,
    });
    useEffect(() => {
        if (scheduler.isSuccess) {
            methods.reset(scheduler.data);
        }
    }, [methods, scheduler.data, scheduler.isSuccess]);
    const mutation = useSchedulersUpdateMutation(schedulerUuid);
    useEffect(() => {
        if (mutation.isSuccess) {
            mutation.reset();
            onBack();
        }
    }, [mutation, mutation.isSuccess, onBack]);
    const handleSubmit = (data: UpdateSchedulerAndTargetsWithoutId) => {
        mutation.mutate(data);
    };
    if (scheduler.isLoading || scheduler.error) {
        return (
            <>
                <DialogBody>
                    {scheduler.isLoading ? (
                        <NonIdealState
                            title="Loading scheduler"
                            icon={<Spinner />}
                        />
                    ) : (
                        <ErrorState error={scheduler.error.error} />
                    )}
                </DialogBody>
                <DialogFooter
                    actions={
                        <>
                            <Button onClick={onBack}>Back</Button>
                        </>
                    }
                />
            </>
        );
    }
    return (
        <>
            <DialogBody>
                <SchedulerForm
                    disabled={mutation.isLoading}
                    methods={methods}
                />
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button onClick={onBack}>Back</Button>
                        <Button
                            intent="primary"
                            loading={mutation.isLoading}
                            onClick={methods.handleSubmit(handleSubmit)}
                        >
                            Save
                        </Button>
                    </>
                }
            />
        </>
    );
};

interface Props extends DialogProps {
    resourceUuid: string;
    schedulersQuery: UseQueryResult<SchedulerAndTargets[], ApiError>;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
}

export const getSchedulerUuidFromUrlParams = (
    search: string,
): string | null => {
    const searchParams = new URLSearchParams(search);
    return searchParams.get('scheduler_uuid');
};

const SchedulersModalContent: FC<Omit<Props, 'name'>> = ({
    resourceUuid,
    schedulersQuery,
    createMutation,
    ...modalProps
}) => {
    const [state, setState] = useState<States>(States.LIST);
    const [schedulerUuid, setSchedulerUuid] = useState<string | undefined>();
    const history = useHistory();
    const { search, pathname } = useLocation();

    useEffect(() => {
        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        if (schedulerUuidFromUrlParams) {
            setState(States.EDIT);
            setSchedulerUuid(schedulerUuidFromUrlParams);

            // remove from url param after modal is open
            const newParams = new URLSearchParams(search);
            newParams.delete('scheduler_uuid');
            history.replace({
                pathname,
                search: newParams.toString(),
            });
        }
    }, [history, pathname, search]);

    return (
        <>
            {state === States.LIST && (
                <ListStateContent
                    schedulersQuery={schedulersQuery}
                    onClose={modalProps.onClose}
                    onConfirm={() => setState(States.CREATE)}
                    onEdit={(schedulerUuidToUpdate) => {
                        setState(States.EDIT);
                        setSchedulerUuid(schedulerUuidToUpdate);
                    }}
                />
            )}
            {state === States.CREATE && (
                <CreateStateContent
                    resourceUuid={resourceUuid}
                    createMutation={createMutation}
                    onBack={() => setState(States.LIST)}
                />
            )}
            {state === States.EDIT && schedulerUuid && (
                <UpdateStateContent
                    schedulerUuid={schedulerUuid}
                    onBack={() => setState(States.LIST)}
                />
            )}
        </>
    );
};

export default SchedulersModalContent;

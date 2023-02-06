import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import {
    CreateSchedulerAndTargetsWithoutIds,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
    useChartSchedulers,
    useChartSchedulersCreateMutation,
} from '../../hooks/scheduler/useChartSchedulers';
import { useScheduler } from '../../hooks/scheduler/useScheduler';
import { useSchedulersUpdateMutation } from '../../hooks/scheduler/useSchedulersUpdateMutation';
import ErrorState from '../common/ErrorState';
import { ArrayInput } from '../ReactHookForm/ArrayInput';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import { SlackIcon, TargetRow } from './SchedulerModals.styles';
import SchedulersList from './SchedulersList';

interface Props extends DialogProps {
    chartUuid: string;
    name: string;
}

enum States {
    LIST,
    CREATE,
    EDIT,
}

const ListStateContent: FC<{
    chartUuid: string;
    onClose: DialogProps['onClose'];
    onConfirm: () => void;
    onEdit: (schedulerUuid: string) => void;
}> = ({ chartUuid, onClose, onConfirm, onEdit }) => {
    const chartSchedulersQuery = useChartSchedulers(chartUuid);
    return (
        <>
            <DialogBody>
                <SchedulersList
                    schedulersQuery={chartSchedulersQuery}
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

const SchedulerForm: FC<
    { disabled: boolean } & React.ComponentProps<typeof Form>
> = ({ disabled, ...rest }) => {
    return (
        <Form name="scheduler" {...rest}>
            <Input
                label="Name"
                name="name"
                placeholder="Scheduled delivery name"
                disabled={disabled}
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                label="Cron expression"
                name="cron"
                placeholder="0 0 * * *"
                disabled={disabled}
                rules={{
                    required: 'Required field',
                }}
            />
            <ArrayInput
                label="Send to"
                name="targets"
                disabled={disabled}
                renderRow={(key, index, remove) => (
                    <TargetRow key={key}>
                        <SlackIcon />
                        <Input
                            name={`targets.${index}.channel`}
                            placeholder="Slack channel"
                            disabled={disabled}
                            rules={{
                                required: 'Required field',
                            }}
                        />
                        <Button
                            minimal={true}
                            icon={'cross'}
                            onClick={() => remove(index)}
                            disabled={disabled}
                        />
                    </TargetRow>
                )}
                renderAppendRowButton={(append) => (
                    <Button
                        minimal
                        onClick={() => append({ channel: '' })}
                        icon={'plus'}
                        text="Add new"
                        disabled={disabled}
                    />
                )}
            />
        </Form>
    );
};

const CreateStateContent: FC<{
    chartUuid: string;
    onBack: () => void;
}> = ({ chartUuid, onBack }) => {
    const methods = useForm<CreateSchedulerAndTargetsWithoutIds>({
        mode: 'onSubmit',
        defaultValues: {
            targets: [{ channel: '' }],
        },
    });
    const mutation = useChartSchedulersCreateMutation(chartUuid);
    useEffect(() => {
        if (mutation.isSuccess) {
            onBack();
        }
    }, [mutation.isSuccess, onBack]);
    const handleSubmit = (data: CreateSchedulerAndTargetsWithoutIds) => {
        mutation.mutate(data);
    };
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
                            Create new
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
            methods.reset();
        }
    }, [methods, scheduler.isSuccess]);
    const mutation = useSchedulersUpdateMutation(schedulerUuid);
    useEffect(() => {
        if (mutation.isSuccess) {
            onBack();
        }
    }, [mutation.isSuccess, onBack]);
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

const ChartSchedulersModal: FC<Props> = ({
    chartUuid,
    name,
    ...modalProps
}) => {
    const [state, setState] = useState<States>(States.LIST);
    const [schedulerUuid, setSchedulerUuid] = useState<string | undefined>();

    // todo: check if has slack

    return (
        <Dialog
            lazy
            title={
                <>
                    Scheduled deliveries for <b>{name}</b>
                </>
            }
            icon="send-message"
            style={{
                minHeight: '400px',
                minWidth: '500px',
            }}
            {...modalProps}
        >
            {state === States.LIST && (
                <ListStateContent
                    chartUuid={chartUuid}
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
                    chartUuid={chartUuid}
                    onBack={() => setState(States.LIST)}
                />
            )}
            {state === States.EDIT && schedulerUuid && (
                <UpdateStateContent
                    schedulerUuid={schedulerUuid}
                    onBack={() => setState(States.LIST)}
                />
            )}
        </Dialog>
    );
};

export default ChartSchedulersModal;

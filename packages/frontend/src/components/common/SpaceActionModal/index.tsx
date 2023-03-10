import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    IconName,
    Intent,
} from '@blueprintjs/core';
import { assertUnreachable, Space } from '@lightdash/common';
import { FC, useState } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import { useHistory } from 'react-router-dom';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useCreateMutation,
    useDeleteMutation,
    useSpace,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import Form from '../../ReactHookForm/Form';
import SimpleButton from '../SimpleButton';

import CreateSpaceModalContent, {
    CreateModalStep,
} from './CreateSpaceModalContent';
import DeleteSpaceModalContent from './DeleteSpaceModalContent';
import UpdateSpaceModalContent from './UpdateSpaceModalContent';

export enum ActionType {
    CREATE,
    UPDATE,
    DELETE,
}

interface ActionModalProps {
    actionType: ActionType;
    title: string;
    icon?: IconName;
    confirmButtonLabel: string;
    confirmButtonIntent?: Intent;
    data?: Space;
    projectUuid: string;
    spaceUuid?: string;
    onClose?: () => void;
    onSubmitForm?: (data?: Space) => void;
    isDisabled: boolean;
    shouldRedirect?: boolean;
}

export interface SpaceModalBody {
    data?: Space;
}

export interface CreateSpaceModalBody {
    data?: Space;
    modalStep: CreateModalStep;
    projectUuid: string;
    form: UseFormReturn<Space, object>;
    setIsShared: (isShared: boolean) => void;
}

const SpaceModal: FC<ActionModalProps> = ({
    data,
    icon,
    title,
    confirmButtonLabel,
    confirmButtonIntent = Intent.PRIMARY,
    isDisabled,
    actionType,
    projectUuid,
    onClose = () => {},
    onSubmitForm,
}) => {
    const { showToastError } = useToaster();

    const form = useForm<Space>({
        mode: 'all',
        defaultValues: data,
    });

    const handleSubmit = (state: any) => {
        try {
            onSubmitForm?.(state);
        } catch (e: any) {
            showToastError({
                title: 'Error saving',
                subtitle: e.message,
            });
        }
    };

    const [modalStep, setModalStep] = useState<CreateModalStep>(
        CreateModalStep.SET_NAME,
    );
    const [isShared, setIsShared] = useState<boolean>(false);

    return (
        <Dialog isOpen title={title} icon={icon} onClose={onClose}>
            <Form name={title} methods={form} onSubmit={handleSubmit}>
                <DialogBody>
                    {actionType === ActionType.CREATE ? (
                        <CreateSpaceModalContent
                            projectUuid={projectUuid}
                            data={data}
                            modalStep={modalStep}
                            form={form}
                            setIsShared={setIsShared}
                        />
                    ) : actionType === ActionType.UPDATE ? (
                        <UpdateSpaceModalContent data={data} />
                    ) : actionType === ActionType.DELETE ? (
                        <DeleteSpaceModalContent data={data} />
                    ) : (
                        assertUnreachable(
                            actionType,
                            'Unexpected action in space',
                        )
                    )}
                </DialogBody>

                <DialogFooter
                    actions={
                        <>
                            {actionType === ActionType.CREATE &&
                                modalStep === CreateModalStep.SET_ACCESS && (
                                    <>
                                        <SimpleButton
                                            text="Back"
                                            onClick={(ev) => {
                                                setModalStep(
                                                    CreateModalStep.SET_NAME,
                                                );
                                                ev.preventDefault();
                                            }}
                                        />
                                        <Button
                                            data-cy="submit-base-modal"
                                            type="submit"
                                            disabled={
                                                isDisabled ||
                                                !form.formState.isValid
                                            }
                                            intent={confirmButtonIntent}
                                            text={confirmButtonLabel}
                                            loading={isDisabled}
                                        />
                                    </>
                                )}
                            {actionType === ActionType.CREATE &&
                                modalStep === CreateModalStep.SET_NAME &&
                                isShared && (
                                    <Button
                                        text="Continue"
                                        disabled={
                                            isDisabled ||
                                            !form.formState.isValid
                                        }
                                        onClick={(ev) => {
                                            setModalStep(
                                                CreateModalStep.SET_ACCESS,
                                            );
                                            ev.preventDefault();
                                        }}
                                    />
                                )}

                            {(actionType !== ActionType.CREATE ||
                                (actionType === ActionType.CREATE &&
                                    modalStep === CreateModalStep.SET_NAME &&
                                    !isShared)) && (
                                <Button
                                    data-cy="submit-base-modal"
                                    type="submit"
                                    disabled={
                                        isDisabled || !form.formState.isValid
                                    }
                                    intent={confirmButtonIntent}
                                    text={confirmButtonLabel}
                                    loading={isDisabled}
                                />
                            )}
                        </>
                    }
                />
            </Form>
        </Dialog>
    );
};

const SpaceActionModal: FC<Omit<ActionModalProps, 'data' | 'isDisabled'>> = ({
    actionType,
    projectUuid,
    spaceUuid,
    onSubmitForm,
    shouldRedirect = true,
    ...props
}) => {
    const { data, isLoading } = useSpace(projectUuid, spaceUuid!, {
        enabled: !!spaceUuid,
    });
    const history = useHistory();

    // Redirect to space on creation
    const { mutateAsync: createMutation, isLoading: isCreating } =
        useCreateMutation(projectUuid, {
            onSuccess: (space) => {
                if (shouldRedirect) {
                    history.push(
                        `/projects/${projectUuid}/spaces/${space.uuid}`,
                    );
                }
            },
        });

    const { mutateAsync: updateMutation, isLoading: isUpdating } =
        useUpdateMutation(projectUuid, spaceUuid!);

    const { mutateAsync: deleteMutation, isLoading: isDeleting } =
        useDeleteMutation(projectUuid);

    const handleSubmitForm = async (state?: Space) => {
        if (actionType === ActionType.CREATE) {
            const result = await createMutation({
                name: state!.name,
                isPrivate: state!.isPrivate,
                access: state!.access,
            });
            onSubmitForm?.(result);
        } else if (actionType === ActionType.UPDATE) {
            const result = await updateMutation({
                name: state!.name,
                isPrivate: state!.isPrivate,
            });
            onSubmitForm?.(result);
        } else if (actionType === ActionType.DELETE) {
            const result = await deleteMutation(spaceUuid!);
            onSubmitForm?.(result);
        } else {
            return assertUnreachable(actionType, 'Unexpected action in space');
        }
        props.onClose?.();
    };

    if (isLoading) return null;

    const isWorking = isCreating || isUpdating || isDeleting;

    return (
        <SpaceModal
            data={data}
            projectUuid={projectUuid}
            spaceUuid={spaceUuid}
            actionType={actionType}
            onSubmitForm={handleSubmitForm}
            isDisabled={isWorking}
            {...props}
        />
    );
};

export default SpaceActionModal;

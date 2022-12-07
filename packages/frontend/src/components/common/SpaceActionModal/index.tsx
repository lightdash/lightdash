import { Button, IconName, Intent } from '@blueprintjs/core';
import { assertUnreachable, Space } from '@lightdash/common';
import { FC, useState } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useCreateMutation,
    useDeleteMutation,
    useSpace,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import BaseModal from '../modal/BaseModal';

import CreateSpaceModalContent from './CreateSpaceModalContent';
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
}

export interface SpaceModalBody {
    data?: Space;
}

export interface CreateSpaceModalBody {
    data?: Space;
    modalStep: number;
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

    const [modalStep, setModalStep] = useState<number>(0);
    const [isShared, setIsShared] = useState<boolean>(false);

    return (
        <BaseModal
            isOpen
            canOutsideClickClose
            title={title}
            icon={icon}
            onClose={onClose}
            methods={form}
            handleSubmit={handleSubmit}
            renderBody={() => {
                switch (actionType) {
                    case ActionType.CREATE:
                        return (
                            <CreateSpaceModalContent
                                data={data}
                                modalStep={modalStep}
                                form={form}
                                setIsShared={setIsShared}
                            />
                        );
                    case ActionType.UPDATE:
                        return <UpdateSpaceModalContent data={data} />;
                    case ActionType.DELETE:
                        return <DeleteSpaceModalContent data={data} />;
                    default:
                        return assertUnreachable(
                            actionType,
                            'Unexpected action in space',
                        );
                }
            }}
            renderFooter={() => (
                <>
                    <Button onClick={onClose}>Cancel</Button>

                    {actionType === ActionType.CREATE && modalStep === 1 && (
                        <Button
                            text="Back"
                            onClick={(ev) => {
                                setModalStep(0);
                                ev.preventDefault();
                            }}
                        />
                    )}
                    {actionType === ActionType.CREATE &&
                    modalStep === 0 &&
                    isShared ? (
                        <Button
                            text="Continue"
                            disabled={isDisabled || !form.formState.isValid}
                            onClick={(ev) => {
                                setModalStep(1);
                                ev.preventDefault();
                            }}
                        />
                    ) : (
                        <Button
                            data-cy="submit-base-modal"
                            type="submit"
                            disabled={isDisabled || !form.formState.isValid}
                            intent={confirmButtonIntent}
                            text={confirmButtonLabel}
                            loading={isDisabled}
                        />
                    )}
                </>
            )}
        />
    );
};

const SpaceActionModal: FC<Omit<ActionModalProps, 'data' | 'isDisabled'>> = ({
    actionType,
    projectUuid,
    spaceUuid,
    onSubmitForm,
    ...props
}) => {
    const { data, isLoading } = useSpace(projectUuid, spaceUuid!, {
        enabled: !!spaceUuid,
    });

    const { mutateAsync: createMutation, isLoading: isCreating } =
        useCreateMutation(projectUuid);

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

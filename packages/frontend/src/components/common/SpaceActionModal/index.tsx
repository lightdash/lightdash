import { Button, IconName, Intent } from '@blueprintjs/core';
import { assertUnreachable, Space } from '@lightdash/common';
import { FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useCreateMutation,
    useDeleteMutation,
    useSpace,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import BaseModal from '../modal/BaseModal';
import ShareSpaceDialog from '../ShareSpaceModal/ShareSpaceDialog';
import { SpaceAccessType } from '../ShareSpaceModal/ShareSpaceSelect';
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
        mode: 'onChange',
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
                        return <CreateSpaceModalContent data={data} />;
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

                    <Button
                        data-cy="submit-base-modal"
                        type="submit"
                        disabled={isDisabled || !form.formState.isValid}
                        intent={confirmButtonIntent}
                        text={confirmButtonLabel}
                        loading={isDisabled}
                    />
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
    const { data, isLoading, isStale } = useSpace(projectUuid, spaceUuid!, {
        enabled: !!spaceUuid,
    });

    const [createdSpaceUuid, setCreatedSpaceUuid] = useState<string>();
    const { mutateAsync: createMutation, isLoading: isCreating } =
        useCreateMutation(projectUuid);

    const { mutateAsync: updateMutation, isLoading: isUpdating } =
        useUpdateMutation(projectUuid, spaceUuid!);

    const { mutateAsync: deleteMutation, isLoading: isDeleting } =
        useDeleteMutation(projectUuid);

    const handleSubmitForm = async (state?: Space & { private: string }) => {
        if (actionType === ActionType.CREATE) {
            const result = await createMutation({
                name: state!.name,
                isPrivate: state!.private === SpaceAccessType.PRIVATE,
            });

            onSubmitForm?.(result);
            if (state!.private === SpaceAccessType.PRIVATE) {
                props.onClose?.();
            } else {
                setCreatedSpaceUuid(result.uuid);
            }
        } else if (actionType === ActionType.UPDATE) {
            const result = await updateMutation({
                name: state!.name,
                isPrivate: state!.isPrivate,
            });
            onSubmitForm?.(result);
            props.onClose?.();
        } else if (actionType === ActionType.DELETE) {
            const result = await deleteMutation(spaceUuid!);
            onSubmitForm?.(result);
            props.onClose?.();
        } else {
            return assertUnreachable(actionType, 'Unexpected action in space');
        }
    };

    if (isLoading) return null;

    const isWorking = isCreating || isUpdating || isDeleting;

    return createdSpaceUuid ? (
        <ShareSpaceDialog
            spaceUuid={createdSpaceUuid}
            projectUuid={projectUuid}
            isOpen={true}
            onClose={() => props.onClose?.()}
        />
    ) : (
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

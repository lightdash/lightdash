import { IconName } from '@blueprintjs/core';
import { ApiError } from '@lightdash/common';
import { Dispatch, FC, SetStateAction, useEffect } from 'react';
import { UseMutationResult } from 'react-query';
import ActionModal, { ActionModalProps } from './ActionModal';

type UpdateActionModalProps<T> = {
    icon?: IconName;
    resourceType?: string;
    useActionModalState: [
        { actionType: number; data?: T },
        Dispatch<SetStateAction<{ actionType: number; data?: T }>>,
    ];
    useUpdate: (id: string) => UseMutationResult<any, ApiError, any>;
    ModalContent: FC<
        Pick<ActionModalProps<T>, 'useActionModalState' | 'isDisabled'>
    >;
};

const UpdateActionModal = <T extends { uuid: string; name: string }>(
    props: UpdateActionModalProps<T>,
) => {
    const {
        useUpdate,
        useActionModalState,
        ModalContent,
        icon,
        resourceType = '',
    } = props;

    const [actionState, setActionState] = useActionModalState;
    const { data: { uuid: id } = {} } = actionState;
    const {
        status: statusUpdate,
        mutate,
        isLoading: isUpdating,
        reset: resetUpdate,
    } = useUpdate(id || '');

    const onSubmitForm = ({ uuid, ...rest }: any) => {
        mutate(rest);
    };

    useEffect(() => {
        if (!isUpdating) {
            resetUpdate();
        }
    }, [isUpdating, resetUpdate]);

    return (
        <ActionModal
            icon={icon}
            title={`Update ${resourceType}`}
            confirmButtonLabel="Save"
            useActionModalState={[actionState, setActionState]}
            isDisabled={isUpdating}
            onSubmitForm={onSubmitForm}
            completedMutation={statusUpdate === 'success'}
            ModalContent={ModalContent}
        />
    );
};

export default UpdateActionModal;

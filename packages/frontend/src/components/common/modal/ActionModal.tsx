import { IconName, Intent } from '@blueprintjs/core';
import { Dispatch, FC, SetStateAction } from 'react';
import { UseFormReturn } from 'react-hook-form';

export enum ActionTypeModal {
    CLOSE,
    UPDATE,
    ADD_TO_DASHBOARD,
    DELETE,
    MOVE_TO_SPACE,
    CREATE_SPACE,
}

export type ActionModalProps<T> = {
    title: string;
    icon?: IconName;
    confirmButtonLabel: string;
    confirmButtonIntent?: Intent;
    useActionModalState: [
        { actionType: number; data?: T },
        Dispatch<SetStateAction<{ actionType: number; data?: T }>>,
    ];
    ModalContent: FC<
        Pick<ActionModalProps<T>, 'useActionModalState' | 'isDisabled'>
    >;
    isDisabled: boolean;
    onSubmitForm: (data: T) => void;
    completedMutation: boolean;
    setFormValues?: (data: any, methods: UseFormReturn<any, object>) => void;
    onClose?: () => void;
    errorMessage?: string;
};

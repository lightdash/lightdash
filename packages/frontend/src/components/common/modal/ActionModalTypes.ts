import { UseFormReturn } from 'react-hook-form';
import { Dispatch, SetStateAction } from 'react';

export enum ActionTypeModal {
    CLOSE,
    UPDATE,
    DELETE,
}

export type ActionModalProps = {
    useActionModalState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    setFormValues?: (data: any, methods: UseFormReturn<any, object>) => void;
    isDisabled: boolean;
    onSubmitForm: (data: any) => void;
    completedMutation: boolean;
    isDeleting?: boolean;
    onClose?: () => void;
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
};

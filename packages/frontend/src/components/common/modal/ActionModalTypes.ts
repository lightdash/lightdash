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
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    isDisabled: boolean;
    onSubmitForm: (data: any) => void;
    completedMutation: boolean;
    setFormValues?: (data: any, methods: UseFormReturn<any, object>) => void;
    isDeleting?: boolean;
    onClose?: () => void;
};

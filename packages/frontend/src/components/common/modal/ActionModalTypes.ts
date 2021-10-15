import { UseFormReturn } from 'react-hook-form';

export enum ActionTypeModal {
    CLOSE,
    UPDATE,
    DELETE,
}

export type ActionModalProps = {
    actionState: { data?: any; actionType: number };
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    isDisabled: boolean;
    onSubmitForm: (data: any) => void;
    completedMutation: boolean;
    onClose: () => void;
    ModalForm: (
        props: Pick<ActionModalProps, 'actionState' | 'isDisabled'>,
    ) => JSX.Element;
};

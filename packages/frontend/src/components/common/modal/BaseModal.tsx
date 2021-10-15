import React, { ReactNode } from 'react';
import { Classes, Dialog, IconName, MaybeElement } from '@blueprintjs/core';
import { UseFormReturn } from 'react-hook-form';
import Form from '../../ReactHookForm/Form';

interface BaseModalProps<T> {
    canOutsideClickClose?: boolean;
    onClose: () => void;
    isOpen: boolean;
    title: string;
    icon: IconName | MaybeElement;
    renderBody: (props?: any) => ReactNode;
    renderFooter: (props?: any) => ReactNode;
    methods: UseFormReturn<any, object>;
    handleSubmit: (data: any) => void;
}

const BaseModal = ({
    renderBody,
    renderFooter,
    methods,
    handleSubmit,
    ...modalProps
}: BaseModalProps<any>) => (
    <Dialog lazy {...modalProps}>
        <Form methods={methods} onSubmit={(data) => handleSubmit(data)}>
            <div className={Classes.DIALOG_BODY}>{renderBody()}</div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    {renderFooter()}
                </div>
            </div>
        </Form>
    </Dialog>
);

BaseModal.defaultProps = {
    canOutsideClickClose: true,
};

export default BaseModal;

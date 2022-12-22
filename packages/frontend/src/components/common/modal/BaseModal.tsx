import { Classes, Dialog, IconName, MaybeElement } from '@blueprintjs/core';
import React, { FC, ReactNode } from 'react';
import { UseFormReturn } from 'react-hook-form';
import Form from '../../ReactHookForm/Form';
import Wrap from '../Wrap';

interface BaseModalProps {
    onClose: () => void;
    isOpen: boolean;
    title: string;
    icon: IconName | MaybeElement;
    renderBody: (props?: any) => ReactNode;
    renderFooter: (props?: any) => ReactNode;
    canOutsideClickClose?: boolean;
    methods?: UseFormReturn<any, object>;
    handleSubmit?: (data: any) => void;
}

const BaseModal: FC<BaseModalProps> = ({
    renderBody,
    renderFooter,
    handleSubmit = () => {},
    methods,
    ...modalProps
}) => (
    <Dialog
        lazy
        {...modalProps}
        className="non-draggable"
        canOutsideClickClose={modalProps.canOutsideClickClose ?? false}
    >
        <Wrap
            wrap={(children) => {
                if (methods) {
                    return (
                        <Form
                            name={modalProps.title}
                            methods={methods}
                            onSubmit={(data: any) => handleSubmit(data)}
                        >
                            {children}
                        </Form>
                    );
                }
                return <>{children}</>;
            }}
        >
            <div className={Classes.DIALOG_BODY}>{renderBody()}</div>
            <div className={Classes.DIALOG_FOOTER}>
                <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                    {renderFooter()}
                </div>
            </div>
        </Wrap>
    </Dialog>
);

export default BaseModal;

import { Classes, Dialog, DialogProps } from '@blueprintjs/core';
import React, { ReactNode } from 'react';
import { UseFormReturn } from 'react-hook-form';
import Form from '../../ReactHookForm/Form';
import Wrap from '../Wrap';

interface BaseModalProps extends DialogProps {
    title: string;
    renderBody: (props?: any) => ReactNode;
    renderFooter: (props?: any) => ReactNode;
    methods?: UseFormReturn<any, object>;
    handleSubmit?: (data: any) => void;
}

const BaseModal: React.FC<BaseModalProps> = ({
    renderBody,
    renderFooter,
    methods,
    handleSubmit,
    ...modalProps
}) => (
    <Dialog lazy {...modalProps} className="non-draggable">
        <Wrap
            wrap={(children) => {
                if (methods && handleSubmit) {
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

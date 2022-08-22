import { Classes, Dialog, IconName, MaybeElement } from '@blueprintjs/core';
import { ReactNode } from 'react';
import { UseFormReturn } from 'react-hook-form';
import Form from '../../ReactHookForm/Form';
import Wrap from '../Wrap';

interface BaseModalProps<T> {
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

const BaseModal = ({
    renderBody,
    renderFooter,
    methods,
    handleSubmit,
    ...modalProps
}: BaseModalProps<any>) => (
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

BaseModal.defaultProps = {
    canOutsideClickClose: true,
    handleSubmit: () => {},
    methods: undefined,
};

export default BaseModal;

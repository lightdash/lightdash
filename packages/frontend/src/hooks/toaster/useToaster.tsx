import { Intent, ToastProps } from '@blueprintjs/core';
import MDEditor from '@uiw/react-md-editor';
import { useCallback } from 'react';
import { AppToaster } from '../../components/AppToaster';

interface Message extends Omit<ToastProps, 'message'> {
    title: string;
    subtitle?: string;
    key?: string;
}

const useToaster = () => {
    const showToast = useCallback(
        ({ title, subtitle, key, timeout = 5000, ...rest }: Message) => {
            AppToaster.show(
                {
                    intent: Intent.NONE,
                    message: (
                        <div>
                            <p style={{ fontWeight: 'bold', marginBottom: 0 }}>
                                {title}
                            </p>
                            {subtitle && (
                                <MDEditor.Markdown
                                    source={subtitle}
                                    linkTarget="_blank"
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: 'white',
                                        fontSize: '12px',
                                    }}
                                />
                            )}
                        </div>
                    ),
                    timeout,
                    ...rest,
                },
                key || title,
            );
        },
        [],
    );

    const showToastSuccess = useCallback(
        (props: Message) => {
            showToast({
                intent: Intent.SUCCESS,
                icon: 'tick-circle',
                ...props,
            });
        },
        [showToast],
    );

    const showToastError = useCallback(
        (props: Message) => {
            showToast({
                intent: Intent.DANGER,
                icon: 'error',
                timeout: 60000,
                ...props,
            });
        },
        [showToast],
    );

    const showToastInfo = useCallback(
        (props: Message) => {
            showToast({
                intent: Intent.NONE,
                icon: 'info-sign',
                ...props,
            });
        },
        [showToast],
    );

    const showToastPrimary = useCallback(
        (props: Message) => {
            showToast({
                intent: Intent.PRIMARY,
                icon: 'info-sign',
                ...props,
            });
        },
        [showToast],
    );

    const showToastWarning = useCallback(
        (props: Message) => {
            showToast({
                intent: Intent.NONE,
                icon: 'warning-sign',
                ...props,
            });
        },
        [showToast],
    );

    return {
        showToast,
        showToastSuccess,
        showToastError,
        showToastInfo,
        showToastPrimary,
        showToastWarning,
    };
};

export default useToaster;

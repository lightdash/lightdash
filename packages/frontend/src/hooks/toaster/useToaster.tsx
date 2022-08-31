import { Intent } from '@blueprintjs/core';
import { IToastProps } from '@blueprintjs/core/src/components/toast/toast';
import MDEditor from '@uiw/react-md-editor';
import React, { useCallback } from 'react';
import { AppToaster } from '../../components/AppToaster';

interface Message extends Omit<IToastProps, 'message'> {
    title: string;
    subtitle?: string;
    key?: string;
}

const useToaster = () => {
    const showToastSuccess = useCallback(
        ({ title, subtitle, key, ...rest }: Message) => {
            AppToaster.show(
                {
                    intent: Intent.SUCCESS,
                    icon: 'tick-circle',
                    timeout: 5000,
                    message: (
                        <div>
                            <p style={{ fontWeight: 'bold', marginBottom: 0 }}>
                                {title}
                            </p>
                            {subtitle && (
                                <MDEditor.Markdown
                                    source={subtitle}
                                    linkTarget="_blank"
                                />
                            )}
                        </div>
                    ),
                    ...rest,
                },
                key || title,
            );
        },
        [],
    );

    const showToastError = useCallback(
        (props: Message) => {
            showToastSuccess({
                intent: Intent.DANGER,
                icon: 'error',
                ...props,
            });
        },
        [showToastSuccess],
    );

    const showToastInfo = useCallback(
        (props: Message) => {
            showToastSuccess({
                intent: Intent.NONE,
                icon: 'info-sign',
                ...props,
            });
        },
        [showToastSuccess],
    );

    return { showToastSuccess, showToastError, showToastInfo };
};

export default useToaster;

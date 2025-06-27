import type { ApiErrorDetail } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { notifications, type NotificationProps } from '@mantine/notifications';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconInfoCircleFilled,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import React, { useCallback, useRef, type ReactNode } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import { v4 as uuid } from 'uuid';
import MantineIcon from '../../components/common/MantineIcon';
import ApiErrorDisplay from './ApiErrorDisplay';
import MultipleToastBody from './MultipleToastBody';
import { type NotificationData } from './types';

const useToaster = () => {
    const openedKeys = useRef(new Set<string>());
    const currentErrors = useRef<Record<string, NotificationData[]>>({});

    const showToast = useCallback(
        ({
            key = uuid(),
            subtitle,
            action,
            color: toastColor,
            autoClose = 5000,
            // isError = false,
            ...rest
        }: NotificationData) => {
            const commonProps = {
                autoClose,
                color: toastColor,
                styles: toastColor
                    ? {
                          title: {
                              color: 'white',
                              fontWeight: 700,
                              marginBottom:
                                  !subtitle && !action ? 0 : undefined,
                          },
                          closeButton: {
                              ':hover': {
                                  background: 'rgba(255, 255, 255, 0.2)',
                              },
                              color: 'white',
                          },
                      }
                    : undefined,
                message:
                    subtitle || action ? (
                        <Stack spacing="xs" align="flex-start">
                            {typeof subtitle == 'string' ? (
                                <MarkdownPreview
                                    source={subtitle}
                                    rehypePlugins={[
                                        [
                                            rehypeExternalLinks,
                                            { target: '_blank' },
                                        ],
                                    ]}
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: toastColor ? 'white' : undefined,
                                        fontSize: '12px',
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        color: toastColor ? 'white' : undefined,
                                        fontSize: '12px',
                                        width: '100%',
                                    }}
                                >
                                    {subtitle}
                                </div>
                            )}

                            {action && (
                                <Button
                                    {...action}
                                    size="xs"
                                    variant="light"
                                    color={toastColor}
                                    leftIcon={
                                        action.icon ? (
                                            <MantineIcon icon={action.icon} />
                                        ) : undefined
                                    }
                                    onClick={(
                                        e: React.MouseEvent<HTMLButtonElement>,
                                    ) => {
                                        notifications.hide(key);
                                        action.onClick?.(e);
                                    }}
                                />
                            )}
                            {/*isError && (
                                <Button
                                    size="xs"
                                    variant="light"
                                    color={toastColor}
                                    leftIcon={<IconSos />}
                                    style={{
                                        alignSelf: 'flex-end',
                                    }}
                                    onClick={() => {
                                        modals.open({
                                            id: 'support-drawer',
                                            title: 'Share with Lightdash Support',
                                            size: 'lg',
                                            children: <SupportDrawerContent />,
                                            yOffset: 100,
                                            zIndex: 1000,
                                        });
                                    }}
                                >
                                    Share with Lightdash
                                </Button>
                            )*/}
                        </Stack>
                    ) : undefined,
                onClose: (props: NotificationProps) => {
                    rest.onClose?.(props);
                    if (props.id) {
                        openedKeys.current.delete(props.id);
                        delete currentErrors.current[props.id];
                    }
                },
            };

            const method = openedKeys.current.has(key) ? 'update' : 'show';

            if (method === 'show') {
                openedKeys.current.add(key);
            }

            notifications[method]({
                id: key,
                ...commonProps,
                ...rest,
            });
        },
        [],
    );

    const showToastSuccess = useCallback(
        (props: NotificationData) => {
            showToast({
                color: 'green',
                bg: 'green',
                icon: <MantineIcon icon={IconCircleCheckFilled} size="xl" />,
                ...props,
            });
        },
        [showToast],
    );

    const showToastError = useCallback(
        (props: NotificationData) => {
            showToast({
                color: 'red',
                bg: 'red',
                icon: <MantineIcon icon={IconAlertTriangleFilled} size="xl" />,
                autoClose: 60000,
                isError: true,
                ...props,
            });
        },
        [showToast],
    );

    const showToastApiError = useCallback(
        (
            props: Omit<NotificationData, 'subtitle'> & {
                apiError: ApiErrorDetail;
            },
        ) => {
            const title: ReactNode | undefined = props.title ?? 'Error';

            const subtitle: ReactNode = props.apiError ? (
                <ApiErrorDisplay apiError={props.apiError} />
            ) : (
                ''
            );

            showToast({
                color: 'red',
                bg: 'red',
                icon: <MantineIcon icon={IconAlertTriangleFilled} size="xl" />,
                autoClose: 60000,
                title,
                subtitle,
                ...props,
            });
        },
        [showToast],
    );

    const showToastInfo = useCallback(
        (props: NotificationData) => {
            showToast({
                icon: <MantineIcon icon={IconInfoCircleFilled} size="xl" />,
                ...props,
            });
        },
        [showToast],
    );

    const showToastPrimary = useCallback(
        (props: NotificationData) => {
            showToast({
                color: 'blue',
                bg: 'blue',
                icon: <MantineIcon icon={IconInfoCircleFilled} size="xl" />,
                ...props,
            });
        },
        [showToast],
    );

    const showToastWarning = useCallback(
        (props: NotificationData) => {
            showToast({
                color: 'yellow',
                bg: 'yellow',
                icon: <MantineIcon icon={IconAlertTriangleFilled} size="xl" />,
                ...props,
            });
        },
        [showToast],
    );

    // This is used to update a multiple toast by key. It is called by
    // addToastError and removeToastError, which pass different specific functions to
    // update the error list
    const updateToastError = useCallback(
        ({
            errorData,
            updateErrorsFunction,
            onCloseError,
        }: {
            errorData: NotificationData;
            updateErrorsFunction: (
                key: string,
                errorData: NotificationData,
            ) => void;
            onCloseError: (data: NotificationData) => void;
        }) => {
            const {
                // By default errors will be grouped under 'error-list'.
                // Consumers can override this by passing a custom key.
                key = 'error-list',
                title,
                subtitle,
                apiError,
                messageKey,
                ...restProps
            } = errorData;

            if (!subtitle && !title && !apiError) return;

            // Execute the specific error update function (add or remove)
            updateErrorsFunction(key, errorData);

            const hasMultipleErrors = currentErrors.current[key]?.length > 1;

            const toastBody = hasMultipleErrors ? (
                <MultipleToastBody
                    title={title}
                    toastsData={currentErrors.current[key]}
                    onCloseError={(error) => onCloseError(error)}
                />
            ) : currentErrors.current[key][0].apiError ? (
                <ApiErrorDisplay
                    apiError={currentErrors.current[key][0].apiError}
                />
            ) : (
                currentErrors.current[key][0].subtitle ||
                currentErrors.current[key][0].title
            );

            showToastError({
                key,
                subtitle: toastBody,
                title: hasMultipleErrors ? undefined : title,
                ...restProps,
            });
        },
        [showToastError],
    );

    const removeToastError = useCallback(
        (notificationData: NotificationData) => {
            updateToastError({
                errorData: notificationData,
                updateErrorsFunction: (key, errorData) => {
                    currentErrors.current[key] = currentErrors.current[
                        key
                    ].filter((d) => d.messageKey !== errorData.messageKey);

                    if (currentErrors.current[key].length === 0) {
                        notifications.hide(key);
                    }
                },
                onCloseError: removeToastError,
            });
        },
        [updateToastError],
    );

    const addToastError = useCallback(
        (notificationData: NotificationData) => {
            updateToastError({
                errorData: notificationData,
                updateErrorsFunction: (key, errorData) => {
                    if (!errorData) return;
                    if (currentErrors.current[key]) {
                        currentErrors.current[key].push({
                            ...notificationData,
                            messageKey: uuid(),
                        });
                    } else {
                        currentErrors.current[key] = [
                            { ...notificationData, messageKey: uuid() },
                        ];
                    }
                },
                onCloseError: removeToastError,
            });
        },
        [removeToastError, updateToastError],
    );

    return {
        addToastError,
        showToastSuccess,
        showToastApiError,
        showToastError,
        showToastInfo,
        showToastPrimary,
        showToastWarning,
    };
};

export default useToaster;

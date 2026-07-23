import type { ApiErrorDetail } from '@lightdash/common';
import { Box, Button, Stack } from '@mantine-8/core';
import {
    notifications,
    type NotificationData as MantineNotificationData,
} from '@mantine-8/notifications';
import {
    IconAlertCircleFilled,
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconInfoCircleFilled,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import clsx from 'clsx';
import React, { useCallback, useRef, type ReactNode } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import { v4 as uuid } from 'uuid';
import MantineIcon from '../../components/common/MantineIcon';
import ApiErrorDisplay from './ApiErrorDisplay';
import MultipleToastBody from './MultipleToastBody';
import { type NotificationData } from './types';
import styles from './useToaster.module.css';

const colorClasses: Record<string, string> = {
    blue: styles.colorBlue,
    green: styles.colorGreen,
    red: styles.colorRed,
    indigo: styles.colorIndigo,
    yellow: styles.colorYellow,
};

const useToaster = () => {
    const openedKeys = useRef(new Set<string>());
    const currentErrors = useRef<Record<string, NotificationData[]>>({});

    const showToast = useCallback(
        ({
            key = uuid(),
            subtitle,
            action,
            color = 'blue',
            autoClose = 5000,
            ...rest
        }: NotificationData) => {
            const commonProps = {
                autoClose,
                color,
                classNames: {
                    root: clsx(
                        styles.root,
                        colorClasses[color] ?? styles.colorBlue,
                    ),
                    title: clsx(
                        styles.title,
                        !subtitle && !action && styles.titleNoMargin,
                    ),
                    description: styles.description,
                    closeButton: styles.closeButton,
                    icon: styles.icon,
                    loader: styles.loader,
                },
                message:
                    subtitle || action ? (
                        <Stack gap="xs" align="flex-start">
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
                                        color: 'var(--toast-text)',
                                        fontSize: '12px',
                                    }}
                                />
                            ) : (
                                <Box className={styles.subtitle}>
                                    {subtitle}
                                </Box>
                            )}

                            {action && (
                                <Button
                                    {...action}
                                    size="xs"
                                    radius="md"
                                    variant="light"
                                    color={color}
                                    leftSection={
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
                        </Stack>
                    ) : undefined,
                onClose: (props: MantineNotificationData) => {
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
                icon: <MantineIcon icon={IconAlertCircleFilled} size="xl" />,
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
                color: 'indigo',
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
                icon: <MantineIcon icon={IconAlertCircleFilled} size="xl" />,
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
                    onClose={() => notifications.hide(key)}
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
                    // Dedupe by content: when several parallel queries fail
                    // with the same error (e.g. main metric-query +
                    // useCompiledSql preview both hitting a table-calc
                    // compile error), we'd otherwise stack identical entries
                    // in the toast. Primitive fields only; ReactNode
                    // subtitles fall back to reference identity.
                    const fingerprintOf = (e: NotificationData) => [
                        e.title ?? null,
                        typeof e.subtitle === 'string' ? e.subtitle : null,
                        e.apiError?.message ?? null,
                        e.apiError?.name ?? null,
                        e.apiError?.statusCode ?? null,
                    ];
                    const fpA = fingerprintOf(errorData);
                    const existing = currentErrors.current[key];
                    if (existing) {
                        const alreadyPresent = existing.some((e) => {
                            const fpB = fingerprintOf(e);
                            return (
                                fpA.every((v, i) => v === fpB[i]) &&
                                (typeof errorData.subtitle === 'string' ||
                                    e.subtitle === errorData.subtitle)
                            );
                        });
                        if (alreadyPresent) return;
                        existing.push({
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

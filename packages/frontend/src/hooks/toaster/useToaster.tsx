import type { ApiErrorDetail } from '@lightdash/common';
import { Box, Button, Stack, type MantineColor } from '@mantine/core';
import {
    notifications,
    type NotificationData as MantineNotificationData,
} from '@mantine/notifications';
import {
    IconAlertCircleFilled,
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconInfoCircleFilled,
    type Icon,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import React, { useCallback, useRef, type ReactNode } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import { v4 as uuid } from 'uuid';
import MantineIcon, {
    type MantineIconSize,
} from '../../components/common/MantineIcon';
import ApiErrorDisplay from './ApiErrorDisplay';
import MultipleToastBody from './MultipleToastBody';
import { type NotificationData, type ToastVariant } from './types';
import styles from './useToaster.module.css';

const TOAST_VARIANTS: Record<
    ToastVariant,
    {
        icon: Icon;
        iconSize: MantineIconSize;
        color: MantineColor;
        autoClose: number;
    }
> = {
    success: {
        icon: IconCircleCheckFilled,
        iconSize: 'xl',
        color: 'green',
        autoClose: 5000,
    },
    error: {
        icon: IconAlertCircleFilled,
        iconSize: 'xl',
        color: 'red',
        autoClose: 60000,
    },
    info: {
        icon: IconInfoCircleFilled,
        iconSize: 'xl',
        color: 'indigo',
        autoClose: 5000,
    },
    primary: {
        icon: IconInfoCircleFilled,
        iconSize: 'xl',
        color: 'blue',
        autoClose: 5000,
    },
    warning: {
        icon: IconAlertCircleFilled,
        iconSize: 'xl',
        color: 'yellow',
        autoClose: 5000,
    },
};

const useToaster = () => {
    const openedKeys = useRef(new Set<string>());
    const currentErrors = useRef<Record<string, NotificationData[]>>({});

    const showToast = useCallback(
        (
            variant: ToastVariant,
            {
                key = uuid(),
                subtitle,
                action,
                autoClose,
                ...rest
            }: NotificationData,
        ) => {
            const variantConfig = TOAST_VARIANTS[variant];

            const commonProps = {
                'data-variant': variant,
                color: variantConfig.color,
                autoClose: autoClose ?? variantConfig.autoClose,
                icon: (
                    <MantineIcon
                        icon={variantConfig.icon}
                        size={variantConfig.iconSize}
                    />
                ),
                classNames: {
                    root: styles.root,
                    title: styles.title,
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
                                    className={styles.markdown}
                                    source={subtitle}
                                    rehypePlugins={[
                                        [
                                            rehypeExternalLinks,
                                            { target: '_blank' },
                                        ],
                                    ]}
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
                                    color={variantConfig.color}
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
        (props: NotificationData) => showToast('success', props),
        [showToast],
    );

    const showToastError = useCallback(
        (props: NotificationData) => showToast('error', props),
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

            showToast('error', {
                icon: <MantineIcon icon={IconAlertTriangleFilled} size="xl" />,
                title,
                subtitle,
                ...props,
            });
        },
        [showToast],
    );

    const showToastInfo = useCallback(
        (props: NotificationData) => showToast('info', props),
        [showToast],
    );

    const showToastPrimary = useCallback(
        (props: NotificationData) => showToast('primary', props),
        [showToast],
    );

    const showToastWarning = useCallback(
        (props: NotificationData) => showToast('warning', props),
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

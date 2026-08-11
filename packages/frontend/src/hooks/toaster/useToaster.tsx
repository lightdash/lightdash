import type { ApiErrorDetail } from '@lightdash/common';
import { Box, Button, Stack, type MantineColor } from '@mantine/core';
import {
    notifications,
    type NotificationData as MantineNotificationData,
} from '@mantine/notifications';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconCircleCheck,
    IconInfoCircle,
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
        icon: IconCircleCheck,
        iconSize: 18,
        color: 'green',
        autoClose: 5000,
    },
    error: {
        icon: IconAlertCircle,
        iconSize: 18,
        color: 'red',
        autoClose: 60000,
    },
    info: {
        icon: IconInfoCircle,
        iconSize: 18,
        color: 'ldGray',
        autoClose: 5000,
    },
    warning: {
        icon: IconAlertTriangle,
        iconSize: 18,
        color: 'orange',
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
                loaderProps: { size: 12, color: 'ldGray.6' },
                closeButtonProps: { 'aria-label': 'Dismiss notification' },
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
                        <Stack gap={0} align="flex-start">
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
                                    className={styles.actionButton}
                                    size="xs"
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

    const showToastWarning = useCallback(
        (props: NotificationData) => showToast('warning', props),
        [showToast],
    );

    const renderGroupedErrors = useCallback(
        function render(key: string) {
            const errors = currentErrors.current[key];
            if (!errors || errors.length === 0) {
                notifications.hide(key);
                return;
            }

            const hasMultipleErrors = errors.length > 1;
            const {
                key: _unusedKey,
                title,
                subtitle,
                apiError,
                messageKey: _unusedMessageKey,
                receivedAt: _unusedReceivedAt,
                ...restProps
            } = errors[errors.length - 1];

            const toastBody = hasMultipleErrors ? (
                <MultipleToastBody
                    toastsData={errors}
                    onDismissError={(messageKey) => {
                        currentErrors.current[key] = (
                            currentErrors.current[key] ?? []
                        ).filter((e) => e.messageKey !== messageKey);
                        render(key);
                    }}
                />
            ) : apiError ? (
                <ApiErrorDisplay
                    apiError={apiError}
                    onClose={() => notifications.hide(key)}
                />
            ) : (
                subtitle || title
            );

            showToastError({
                key,
                subtitle: toastBody,
                title: hasMultipleErrors ? `${errors.length} errors` : title,
                ...restProps,
            });
        },
        [showToastError],
    );

    const addToastError = useCallback(
        (notificationData: NotificationData) => {
            const {
                // By default errors will be grouped under 'error-list'.
                // Consumers can override this by passing a custom key.
                key = 'error-list',
                title,
                subtitle,
                apiError,
            } = notificationData;

            if (!subtitle && !title && !apiError) return;

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
            const fpA = fingerprintOf(notificationData);
            const existing = currentErrors.current[key];
            if (existing) {
                const alreadyPresent = existing.some((e) => {
                    const fpB = fingerprintOf(e);
                    return (
                        fpA.every((v, i) => v === fpB[i]) &&
                        (typeof notificationData.subtitle === 'string' ||
                            e.subtitle === notificationData.subtitle)
                    );
                });
                if (!alreadyPresent) {
                    existing.push({
                        ...notificationData,
                        messageKey: uuid(),
                        receivedAt: new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        }),
                    });
                }
            } else {
                currentErrors.current[key] = [
                    {
                        ...notificationData,
                        messageKey: uuid(),
                        receivedAt: new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        }),
                    },
                ];
            }

            renderGroupedErrors(key);
        },
        [renderGroupedErrors],
    );

    return {
        addToastError,
        showToastSuccess,
        showToastApiError,
        showToastError,
        showToastInfo,
        showToastWarning,
    };
};

export default useToaster;

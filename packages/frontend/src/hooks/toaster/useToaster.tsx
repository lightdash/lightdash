import type { ApiErrorDetail } from '@lightdash/common';
import {
    Box,
    Button,
    Stack,
    useMantineColorScheme,
    useMantineTheme,
} from '@mantine/core';
import { notifications, type NotificationProps } from '@mantine/notifications';
import {
    IconAlertCircleFilled,
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
    const theme = useMantineTheme();
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';
    const openedKeys = useRef(new Set<string>());
    const currentErrors = useRef<Record<string, NotificationData[]>>({});

    const showToast = useCallback(
        ({
            key = uuid(),
            subtitle,
            action,
            color = 'blue',
            autoClose = 5000,
            // isError = false,
            ...rest
        }: NotificationData) => {
            const commonProps = {
                autoClose,
                color,
                styles: {
                    root: {
                        background: isDark
                            ? theme.fn.darken(theme.colors[color][9], 0.6)
                            : theme.fn.lighten(theme.colors[color][0], 0.5),
                        border: `1px solid ${
                            isDark
                                ? theme.colors[color][9]
                                : theme.colors[color][2]
                        }`,
                        borderRadius: theme.radius.md,
                        boxShadow: theme.shadows.subtle,
                    },
                    title: {
                        color: isDark
                            ? theme.colors[color][1]
                            : theme.fn.darken(theme.colors[color][9], 0.1),
                        fontWeight: 700,
                        marginBottom: !subtitle && !action ? 0 : undefined,
                    },
                    description: {
                        color: isDark
                            ? theme.colors[color][3]
                            : theme.fn.darken(theme.colors[color][9], 0.4),
                    },
                    closeButton: {
                        ':hover': {
                            background: isDark
                                ? theme.fn.darken(theme.colors[color][9], 0.4)
                                : theme.colors[color][1],
                        },
                        padding: '4px',
                        color: isDark
                            ? theme.colors[color][2]
                            : theme.colors[color][9],
                    },
                    icon: {
                        backgroundColor: 'transparent',
                        color: isDark
                            ? theme.colors[color][4]
                            : theme.colors[color][7],
                        size: '12px',
                        padding: '4px',
                    },
                },
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
                                        color: isDark
                                            ? theme.colors[color][2]
                                            : theme.colors[color][9],
                                        fontSize: '12px',
                                    }}
                                />
                            ) : (
                                <Box
                                    c={
                                        isDark
                                            ? theme.colors[color][2]
                                            : theme.colors[color][9]
                                    }
                                    fz="xs"
                                    w="100%"
                                >
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
        [isDark, theme],
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

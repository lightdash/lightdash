import type { ApiErrorDetail } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Collapse,
    CopyButton,
    Group,
    Stack,
    Text,
    Title,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import { notifications, type NotificationProps } from '@mantine/notifications';
import { type PolymorphicComponentProps } from '@mantine/utils';
import {
    IconAlertTriangleFilled,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCircleCheckFilled,
    IconCopy,
    IconInfoCircleFilled,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import React, { useCallback, useRef, useState, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';
import MantineIcon from '../../components/common/MantineIcon';

const ApiErrorDisplay = ({ apiError }: { apiError: ApiErrorDetail }) => {
    return apiError.id ? (
        <Stack spacing="xxs">
            <Text mb={0}>{apiError.message}</Text>
            <Text mb={0} weight="bold">
                You can contact support with this error ID
            </Text>
            <Group spacing="xxs">
                <Text mb={0} weight="bold">
                    {apiError.id}
                </Text>
                <CopyButton value={apiError.id}>
                    {({ copied, copy }) => (
                        <Tooltip
                            label={copied ? 'Copied' : 'Copy error ID'}
                            withArrow
                            position="right"
                        >
                            <ActionIcon
                                size="xs"
                                onClick={copy}
                                variant={'transparent'}
                            >
                                <MantineIcon
                                    color={'white'}
                                    icon={copied ? IconCheck : IconCopy}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            </Group>
        </Stack>
    ) : (
        <>{apiError.message}</>
    );
};

const MultipleToastBody = ({
    toastsData,
    onCloseError,
}: {
    title?: ReactNode;
    toastsData: NotificationData[];
    onCloseError?: (errorData: NotificationData) => void;
}) => {
    const [listCollapsed, setListCollapsed] = useState(true);

    return (
        <Stack spacing="xs" align="stretch">
            <Group>
                <Title order={6}>Errors</Title>
                <Button
                    size="xs"
                    compact
                    variant="outline"
                    color="red.1"
                    rightIcon={
                        <MantineIcon
                            color="red.1"
                            icon={
                                listCollapsed ? IconChevronUp : IconChevronDown
                            }
                        />
                    }
                    onClick={() => setListCollapsed(!listCollapsed)}
                >
                    <Text>{`${listCollapsed ? 'Show' : 'Hide'} ${
                        toastsData.length
                    }`}</Text>
                </Button>
            </Group>

            <Collapse
                in={!listCollapsed}
                style={{
                    maxHeight: 155,
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Stack spacing="xs" pb="sm">
                    {toastsData.map((toastData, index) => (
                        <Group
                            key={`${toastData.subtitle}-${index}`}
                            position="apart"
                            spacing="xxs"
                            noWrap
                            sx={(theme) => ({
                                width: '100%',
                                border: `1px solid ${theme.colors.red[3]}`,
                                borderRadius: '4px',
                                padding: theme.spacing.xs,
                            })}
                        >
                            {toastData.apiError ? (
                                <ApiErrorDisplay
                                    apiError={toastData.apiError}
                                />
                            ) : (
                                <>
                                    {toastData.title && (
                                        <Title order={6}>
                                            {toastData.title}
                                        </Title>
                                    )}
                                    {toastData.subtitle && (
                                        <MarkdownPreview
                                            source={toastData.subtitle.toString()}
                                            linkTarget="_blank"
                                            style={{
                                                backgroundColor: 'transparent',
                                                color: 'white',
                                                fontSize: '12px',
                                            }}
                                        />
                                    )}
                                </>
                            )}

                            <ActionIcon
                                variant="transparent"
                                size="xs"
                                onClick={() => onCloseError?.(toastData)}
                            >
                                <MantineIcon icon={IconX} color="white" />
                            </ActionIcon>
                        </Group>
                    ))}
                </Stack>
            </Collapse>
        </Stack>
    );
};

type NotificationData = Omit<
    Parameters<typeof notifications.show>[0],
    'message' | 'key'
> & {
    key?: string;
    subtitle?: string | ReactNode;
    action?: PolymorphicComponentProps<'button', ButtonProps> & {
        icon?: Icon;
    };
    apiError?: ApiErrorDetail;
    messageKey?: string;
};

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
                                    linkTarget="_blank"
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
                                    onClick={(e) => {
                                        notifications.hide(key);
                                        action.onClick?.(e);
                                    }}
                                />
                            )}
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
            const subtitle: ReactNode = (
                <ApiErrorDisplay apiError={props.apiError} />
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

import type { ApiErrorDetail } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    CopyButton,
    Group,
    Stack,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import { notifications, type NotificationProps } from '@mantine/notifications';
import { type PolymorphicComponentProps } from '@mantine/utils';
import {
    IconAlertTriangleFilled,
    IconCheck,
    IconCircleCheckFilled,
    IconCopy,
    IconInfoCircleFilled,
    type Icon,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import React, { useCallback, useRef, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';
import MantineIcon from '../../components/common/MantineIcon';

type NotificationData = Omit<
    Parameters<typeof notifications.show>[0],
    'message' | 'key'
> & {
    key?: string;
    subtitle?: string | ReactNode;
    action?: PolymorphicComponentProps<'button', ButtonProps> & {
        icon?: Icon;
    };
};

const useToaster = () => {
    const openedKeys = useRef(new Set<string>());

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
                    if (props.id) openedKeys.current.delete(props.id);
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
            const subtitle: ReactNode = props.apiError.id ? (
                <>
                    <Text mb={0}>{props.apiError.message}</Text>
                    <Text mb={0} weight="bold">
                        You can contact support with the following error ID
                    </Text>
                    <Group>
                        <Text mb={0} weight="bold">
                            {props.apiError.id}
                        </Text>
                        <CopyButton value={props.apiError.id}>
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
                </>
            ) : (
                props.apiError.message
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

    return {
        showToastSuccess,
        showToastApiError,
        showToastError,
        showToastInfo,
        showToastPrimary,
        showToastWarning,
    };
};

export default useToaster;

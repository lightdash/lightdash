import { Button, ButtonProps, Stack } from '@mantine/core';
import { useId } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { PolymorphicComponentProps } from '@mantine/utils';
import {
    Icon,
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconInfoCircleFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useCallback } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type NotificationData = Omit<
    Parameters<typeof notifications.show>[0],
    'message' | 'key'
> & {
    key?: string;
    subtitle?: string | JSX.Element;
    action?: PolymorphicComponentProps<'button', ButtonProps> & {
        icon?: Icon;
    };
};

const useToaster = () => {
    const uuid = useId();

    const showToast = useCallback(
        ({
            key: id = uuid,
            subtitle,
            action,
            color: toastColor,
            autoClose = 5000,
            ...rest
        }: NotificationData) => {
            notifications.show({
                id,
                autoClose,
                color: toastColor,
                message:
                    subtitle || action ? (
                        <Stack spacing="xs" align="flex-start">
                            {typeof subtitle == 'string' ? (
                                <MDEditor.Markdown
                                    source={subtitle}
                                    linkTarget="_blank"
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: toastColor ? 'white' : undefined,
                                        fontSize: '12px',
                                    }}
                                />
                            ) : (
                                subtitle
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
                                        notifications.hide(id);
                                        action.onClick?.(e);
                                    }}
                                />
                            )}
                        </Stack>
                    ) : undefined,
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
                ...rest,
            });
        },
        [uuid],
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
        showToastError,
        showToastInfo,
        showToastPrimary,
        showToastWarning,
    };
};

export default useToaster;

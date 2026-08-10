import { type ApiErrorDetail } from '@lightdash/common';
import {
    type ButtonProps,
    type PolymorphicComponentProps,
} from '@mantine/core';
import { type notifications } from '@mantine/notifications';
import { type Icon } from '@tabler/icons-react';
import { type ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'primary' | 'warning';

export type NotificationData = Omit<
    Parameters<typeof notifications.show>[0],
    'message' | 'key' | 'color'
> & {
    key?: string;
    subtitle?: string | ReactNode;
    action?: PolymorphicComponentProps<'button', ButtonProps> & {
        icon?: Icon;
    };
    apiError?: ApiErrorDetail;
    messageKey?: string;
};

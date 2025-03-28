import { type ApiErrorDetail } from '@lightdash/common';
import { type ButtonProps } from '@mantine/core';
import { type notifications } from '@mantine/notifications';
import { type PolymorphicComponentProps } from '@mantine/utils';
import { type Icon } from '@tabler/icons-react';
import { type ReactNode } from 'react';

export type NotificationData = Omit<
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
    isError?: boolean;
};

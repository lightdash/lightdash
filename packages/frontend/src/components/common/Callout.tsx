import { Alert, type AlertProps, type MantineColor } from '@mantine-8/core';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconInfoCircle,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from './MantineIcon';

type CalloutVariant = 'danger' | 'warning' | 'info';

const CALLOUT_CONFIG: Record<
    CalloutVariant,
    {
        color: MantineColor;
        icon: typeof IconAlertCircle;
    }
> = {
    danger: {
        color: 'red',
        icon: IconAlertCircle,
    },
    warning: {
        color: 'yellow',
        icon: IconAlertTriangle,
    },
    info: {
        color: 'blue',
        icon: IconInfoCircle,
    },
};

interface CalloutProps extends Omit<AlertProps, 'title' | 'icon'> {
    variant: CalloutVariant;
    title?: ReactNode;
    children: ReactNode;
}

/**
 * Reusable callout component with predefined variants for consistent styling.
 *
 * @example
 * // Danger callout
 * <Callout variant="danger" title="Warning!">
 *   This action cannot be undone.
 * </Callout>
 *
 * @example
 * // Info callout
 * <Callout variant="info" title="Note">
 *   This is informational content.
 * </Callout>
 */
const Callout: FC<CalloutProps> = ({
    variant,
    title,
    children,
    ...alertProps
}) => {
    const config = CALLOUT_CONFIG[variant];
    const IconComponent = config.icon;

    return (
        <Alert
            color={config.color}
            variant="light"
            radius="md"
            icon={<MantineIcon icon={IconComponent} size="lg" />}
            title={title}
            {...alertProps}
        >
            {children}
        </Alert>
    );
};

export default Callout;

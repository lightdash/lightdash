import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { Spinner } from './spinner';
import { useTheme } from './themeProvider';

export type StatusVariant =
    | 'success'
    | 'error'
    | 'warning'
    | 'info'
    | 'loading'
    | 'pending';

const ICONS: Record<Exclude<StatusVariant, 'loading'>, string> = {
    error: '✗',
    info: 'ℹ',
    pending: '○',
    success: '✓',
    warning: '⚠',
};

type StatusMessageProps = {
    variant?: StatusVariant;
    children: ReactNode;
    icon?: string;
};

export const StatusMessage = ({
    variant = 'info',
    children,
    icon,
}: StatusMessageProps) => {
    const theme = useTheme();
    const variantColor: Record<StatusVariant, string> = {
        success: theme.colors.success,
        error: theme.colors.error,
        warning: theme.colors.warning,
        loading: theme.colors.primary,
        pending: theme.colors.muted,
        info: theme.colors.info,
    };

    return (
        <Box flexDirection="row">
            {variant === 'loading' ? (
                <Spinner color={variantColor[variant]} />
            ) : (
                <Text color={variantColor[variant]}>
                    {icon ?? ICONS[variant]}
                </Text>
            )}
            <Text> </Text>
            <Text>{children}</Text>
        </Box>
    );
};

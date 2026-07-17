import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { useTheme } from './themeProvider';
import type { BorderStyle } from './types';

export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

const ICONS: Record<AlertVariant, string> = {
    error: '✗',
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
};

type AlertProps = {
    variant?: AlertVariant;
    title: string;
    children?: ReactNode;
    borderStyle?: BorderStyle;
};

export const Alert = ({
    variant = 'info',
    title,
    children,
    borderStyle,
}: AlertProps) => {
    const theme = useTheme();
    const variantColor: Record<AlertVariant, string> = {
        success: theme.colors.success,
        error: theme.colors.error,
        warning: theme.colors.warning,
        info: theme.colors.info,
    };

    return (
        <Box
            borderStyle={borderStyle ?? theme.border.style}
            borderColor={variantColor[variant]}
            paddingX={1}
            flexDirection="column"
        >
            <Box flexDirection="row">
                <Text bold color={variantColor[variant]}>
                    {ICONS[variant]}
                </Text>
                <Text> </Text>
                <Text bold color={variantColor[variant]}>
                    {title}
                </Text>
            </Box>
            {children ? <Text>{children}</Text> : null}
        </Box>
    );
};

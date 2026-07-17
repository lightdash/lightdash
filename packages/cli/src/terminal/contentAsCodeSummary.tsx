import { Box, render, Text } from 'ink';
import { Alert } from './components/ui/alert';
import {
    StatusMessage,
    type StatusVariant,
} from './components/ui/statusMessage';
import { ThemeProvider, useTheme } from './components/ui/themeProvider';

export type ContentAsCodeSummaryItem = {
    label: string;
    detail: string;
    variant?: Exclude<StatusVariant, 'loading' | 'pending'>;
};

export type ContentAsCodeSummaryProps = {
    operation: 'download' | 'upload';
    scope: 'organization' | 'project';
    path: string;
    elapsedSeconds: number;
    items: ContentAsCodeSummaryItem[];
};

const ContentAsCodeSummaryPanel = ({
    operation,
    scope,
    path,
    elapsedSeconds,
    items,
}: ContentAsCodeSummaryProps) => {
    const theme = useTheme();
    const operationLabel = operation === 'download' ? 'DOWNLOAD' : 'UPLOAD';
    const pathLabel = operation === 'download' ? 'Saved to' : 'Read from';
    const width = Math.min(process.stderr.columns ?? 76, 76);

    return (
        <Box
            borderStyle={theme.border.style}
            borderColor={theme.colors.primary}
            flexDirection="column"
            paddingX={2}
            width={width}
        >
            <Box flexDirection="column" alignItems="center">
                <Text bold color={theme.colors.primary}>
                    ⚡ LIGHTDASH
                </Text>
                <Text bold>CONTENT AS CODE · {operationLabel}</Text>
                <Text color={theme.colors.mutedForeground}>
                    {scope} · {elapsedSeconds.toFixed(1)}s
                </Text>
            </Box>

            <Box flexDirection="column" marginY={1}>
                {items.map(({ label, detail, variant = 'success' }) => (
                    <StatusMessage key={label} variant={variant}>
                        <Text bold>{label.padEnd(16)}</Text>
                        <Text color={theme.colors.mutedForeground}>
                            {detail}
                        </Text>
                    </StatusMessage>
                ))}
            </Box>

            <Alert variant="success" title={`${operationLabel} COMPLETE`}>
                {pathLabel}: {path}
            </Alert>
        </Box>
    );
};

export const ContentAsCodeSummary = (props: ContentAsCodeSummaryProps) => (
    <ThemeProvider>
        <ContentAsCodeSummaryPanel {...props} />
    </ThemeProvider>
);

export const renderContentAsCodeSummary = async (
    props: ContentAsCodeSummaryProps,
): Promise<boolean> => {
    if (
        !process.stderr.isTTY ||
        process.env.CI === 'true' ||
        process.env.TERM === 'dumb' ||
        process.env.NO_UNICODE === '1' ||
        process.env.NO_UNICODE === 'true'
    ) {
        return false;
    }

    const instance = render(<ContentAsCodeSummary {...props} />, {
        stdout: process.stderr,
        debug: false,
        exitOnCtrlC: false,
    });
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
    });
    instance.unmount();
    instance.cleanup();
    return true;
};

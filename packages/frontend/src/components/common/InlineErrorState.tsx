import { Button, Group, Paper, Text, type PaperProps } from '@mantine-8/core';
import { type FC } from 'react';

type InlineErrorStateProps = PaperProps & {
    message: string;
    onRetry?: () => void;
};

// Compact failure state for a single section, styled with the theme's dotted
// Paper variant. For whole-view failures use ErrorState/SuboptimalState.
const InlineErrorState: FC<InlineErrorStateProps> = ({
    message,
    onRetry,
    ...paperProps
}) => (
    <Paper variant="dotted" p="md" {...paperProps}>
        <Group justify="space-between" gap="xs">
            <Text fz="sm" c="ldGray.6">
                {message}
            </Text>
            {onRetry && (
                <Button variant="subtle" size="compact-xs" onClick={onRetry}>
                    Retry
                </Button>
            )}
        </Group>
    </Paper>
);

export default InlineErrorState;

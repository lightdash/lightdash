import { Button, Group, Paper, Text, type PaperProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

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
}) => {
    const { t } = useTranslation('common');
    return (
        <Paper variant="dotted" p="md" {...paperProps}>
            <Group justify="space-between" gap="xs">
                <Text fz="sm" c="dimmed">
                    {message}
                </Text>
                {onRetry && (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={onRetry}
                    >
                        {t('actions.retry')}
                    </Button>
                )}
            </Group>
        </Paper>
    );
};

export default InlineErrorState;

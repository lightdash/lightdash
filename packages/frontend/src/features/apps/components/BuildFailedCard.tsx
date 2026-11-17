import { Box, Button, Group, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconPencil,
    IconRefresh,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './BuildCards.module.css';

type Props = {
    message: string;
    /** Version the preview falls back to; null when nothing was ever built. */
    fallbackVersion: number | null;
    /** Null hides Retry (e.g. the failed prompt had attachments). */
    onRetry: (() => void) | null;
    onEditPrompt: (() => void) | null;
    disabled: boolean;
};

const BuildFailedCard: FC<Props> = ({
    message,
    fallbackVersion,
    onRetry,
    onEditPrompt,
    disabled,
}) => {
    const consequence =
        fallbackVersion === null
            ? 'No version was created.'
            : `Nothing changed — the preview still shows v${fallbackVersion}.`;

    return (
        <Box className={classes.failedCard} role="status">
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <MantineIcon
                    icon={IconAlertTriangle}
                    size={16}
                    className={classes.failedIcon}
                />
                <Box miw={0}>
                    <Text size="sm" fw={600}>
                        Build failed
                    </Text>
                    <Text size="xs" className={classes.failedBody}>
                        {message} {consequence}
                    </Text>
                </Box>
            </Group>
            {(onRetry || onEditPrompt) && (
                <Group gap="xs" mt="sm" className={classes.failedActions}>
                    {onRetry && (
                        <Button
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconRefresh} size={14} />
                            }
                            onClick={onRetry}
                            disabled={disabled}
                        >
                            Retry
                        </Button>
                    )}
                    {onEditPrompt && (
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconPencil} size={14} />
                            }
                            onClick={onEditPrompt}
                            disabled={disabled}
                        >
                            Edit prompt
                        </Button>
                    )}
                </Group>
            )}
        </Box>
    );
};

export default BuildFailedCard;

import { APP_VERSION_CANCELLED_BY_USER } from '@lightdash/common';
import { Box, Button, Group, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconPencil,
    IconHandStop,
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
    const stopped = message === APP_VERSION_CANCELLED_BY_USER;
    const consequence =
        fallbackVersion === null
            ? 'No version was created.'
            : `Nothing changed — the preview still shows v${fallbackVersion}.`;

    return (
        <Box
            className={classes.failedCard}
            data-kind={stopped ? 'stopped' : 'failed'}
            role="status"
        >
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <MantineIcon
                    icon={stopped ? IconHandStop : IconAlertTriangle}
                    size={16}
                    className={classes.failedIcon}
                />
                <Box miw={0}>
                    <Text size="sm" fw={600}>
                        {stopped ? 'Build stopped' : 'Build failed'}
                    </Text>
                    <Text size="xs" className={classes.failedBody}>
                        {stopped
                            ? `You stopped this build. ${consequence}`
                            : `${message} ${consequence}`}
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

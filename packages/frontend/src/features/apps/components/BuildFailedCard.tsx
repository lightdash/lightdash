import { Button, Group, Text } from '@mantine/core';
import { IconPencil, IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';

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
            : `Nothing changed. The preview still shows v${fallbackVersion}.`;

    return (
        <Callout variant="danger" title="Build failed" role="status" w="100%">
            <Text size="xs">
                {message} {consequence}
            </Text>
            {(onRetry || onEditPrompt) && (
                <Group gap="xs" mt="sm">
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
        </Callout>
    );
};

export default BuildFailedCard;

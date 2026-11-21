import { ActionIcon, Badge, Button, Group, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

/** The Design Mode bubbles waiting to go to the builder as one prompt. */
const DesignBundleTray: FC<{
    chips: { bubbleId: string; label: string }[];
    /** The builder cannot take a prompt right now. */
    busy: boolean;
    /** Send all was asked for and waits on the builder. */
    waiting: boolean;
    onRemove: (bubbleId: string) => void;
    onSendAll: () => void;
}> = ({ chips, busy, waiting, onRemove, onSendAll }) =>
    chips.length === 0 ? null : (
        <Group gap="xs" justify="space-between" align="flex-start">
            <Group gap={4}>
                {chips.map((chip) => (
                    <Badge
                        key={chip.bubbleId}
                        variant="light"
                        color="gray"
                        tt="none"
                        fw={500}
                        rightSection={
                            <ActionIcon
                                size="xs"
                                variant="transparent"
                                color="gray"
                                aria-label={`Remove ${chip.label}`}
                                onClick={() => onRemove(chip.bubbleId)}
                            >
                                <MantineIcon icon={IconX} size={12} />
                            </ActionIcon>
                        }
                    >
                        {chip.label}
                    </Badge>
                ))}
            </Group>
            <Group gap="xs" wrap="nowrap">
                {waiting && (
                    <Text size="xs" c="dimmed">
                        Sends when the build finishes
                    </Text>
                )}
                <Button
                    size="compact-xs"
                    variant="light"
                    disabled={waiting}
                    onClick={onSendAll}
                >
                    {busy || waiting ? 'Send when ready' : 'Send all'}
                </Button>
            </Group>
        </Group>
    );

export default DesignBundleTray;

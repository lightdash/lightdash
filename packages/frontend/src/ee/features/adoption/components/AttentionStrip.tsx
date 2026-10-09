import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconUserQuestion, IconUsers } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { formatShared, formatUnassigned } from '../utils/attention';

// Narrower than this, the message leaves the button a line of its own rather than squeeze it
const MESSAGE_MIN_WIDTH = '16rem';

type Props = {
    unassignedCount: number;
    sharedCount: number; // in more than one department and counted in each
    canManage: boolean;
    onPlace: () => void;
    onReviewShared: () => void;
};

export const AttentionStrip: FC<Props> = ({
    unassignedCount,
    sharedCount,
    canManage,
    onPlace,
    onReviewShared,
}) => {
    const hasUnassigned = unassignedCount > 0;
    const hasShared = sharedCount > 0;
    if (!hasUnassigned && !hasShared) return null;
    // Being in several departments is information, so it only warns when someone is in none
    // Mantine's Alert carries role="alert", so screen readers announce it
    return (
        <Callout
            variant={hasUnassigned ? 'warning' : 'neutral'}
            icon={
                <MantineIcon
                    icon={hasUnassigned ? IconUserQuestion : IconUsers}
                    size="lg"
                />
            }
        >
            <Group justify="space-between" wrap="wrap">
                <Stack
                    gap={4}
                    align="flex-start"
                    flex={`1 1 ${MESSAGE_MIN_WIDTH}`}
                >
                    {hasUnassigned && (
                        <Text fz="sm">
                            {formatUnassigned(unassignedCount)}.{' '}
                            {canManage
                                ? "They aren't counted in any department until you place them"
                                : "They aren't counted in any department until an admin places them"}
                        </Text>
                    )}
                    {hasShared &&
                        (canManage ? (
                            <Anchor
                                component="button"
                                type="button"
                                fz="sm"
                                c="dimmed"
                                ta="left"
                                onClick={onReviewShared}
                            >
                                {formatShared(sharedCount)}
                            </Anchor>
                        ) : (
                            <Text fz="sm" c="dimmed">
                                {formatShared(sharedCount)}
                            </Text>
                        ))}
                </Stack>
                {canManage && hasUnassigned && (
                    <Button
                        size="compact-sm"
                        variant="default"
                        flex="none"
                        onClick={onPlace}
                    >
                        Place people
                    </Button>
                )}
            </Group>
        </Callout>
    );
};

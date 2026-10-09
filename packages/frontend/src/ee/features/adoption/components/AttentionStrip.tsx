import { Anchor, Stack, Text } from '@mantine/core';
import { IconUserQuestion, IconUsers } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { formatShared, formatUnassigned } from '../utils/attention';

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
    // Being in several departments is information: it neither warns nor interrupts a screen reader
    return (
        <Callout
            variant={hasUnassigned ? 'warning' : 'neutral'}
            role={hasUnassigned ? 'alert' : 'status'}
            icon={
                <MantineIcon
                    icon={hasUnassigned ? IconUserQuestion : IconUsers}
                    size="lg"
                />
            }
        >
            {/* The page header has the Place people button, so the strip only links from its sentences */}
            <Stack gap={4} align="flex-start">
                {hasUnassigned && (
                    <Text fz="sm">
                        {formatUnassigned(unassignedCount)}.{' '}
                        {canManage ? (
                            <>
                                {
                                    "They aren't counted in any department until you "
                                }
                                <Anchor
                                    component="button"
                                    type="button"
                                    inherit
                                    onClick={onPlace}
                                >
                                    place them
                                </Anchor>
                            </>
                        ) : (
                            "They aren't counted in any department until an admin places them"
                        )}
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
        </Callout>
    );
};

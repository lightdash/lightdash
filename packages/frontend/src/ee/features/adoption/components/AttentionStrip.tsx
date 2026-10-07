import { Button, Group, Text } from '@mantine/core';
import { IconUserQuestion } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { formatAttention } from '../utils/attention';

type Props = {
    conflictCount: number;
    unassignedCount: number;
    canManage: boolean;
    onReview: () => void;
};

export const AttentionStrip: FC<Props> = ({
    conflictCount,
    unassignedCount,
    canManage,
    onReview,
}) => {
    const message = formatAttention(conflictCount, unassignedCount);
    if (message === null) return null;
    // Mantine's Alert carries role="alert", so screen readers announce it
    return (
        <Callout
            variant="warning"
            icon={<MantineIcon icon={IconUserQuestion} size="lg" />}
        >
            <Group justify="space-between" wrap="nowrap">
                <Text fz="sm">
                    {message}.{' '}
                    {canManage
                        ? "They aren't counted in any department until you place them"
                        : "They aren't counted in any department until an admin places them"}
                </Text>
                {canManage && (
                    <Button
                        size="compact-sm"
                        variant="default"
                        onClick={onReview}
                    >
                        Place people
                    </Button>
                )}
            </Group>
        </Callout>
    );
};

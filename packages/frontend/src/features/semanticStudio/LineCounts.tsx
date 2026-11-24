import { Text } from '@mantine/core';
import { type FC } from 'react';

export const LineCounts: FC<{
    counts: { additions: number; deletions: number } | null;
}> = ({ counts }) =>
    counts ? (
        <Text fz="xs" flex="none">
            {counts.additions > 0 ? (
                <Text span inherit c="green.7">
                    +{counts.additions}
                </Text>
            ) : null}
            {counts.additions > 0 && counts.deletions > 0 ? ' ' : null}
            {counts.deletions > 0 ? (
                <Text span inherit c="red.7">
                    −{counts.deletions}
                </Text>
            ) : null}
        </Text>
    ) : null;

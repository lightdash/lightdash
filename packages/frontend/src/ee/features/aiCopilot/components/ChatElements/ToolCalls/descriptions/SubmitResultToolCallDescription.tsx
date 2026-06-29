import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { z } from 'zod';
import { ToolCallChip } from '../ToolCallChip';

const submitResultArgsSchema = z.object({
    handoff: z
        .discriminatedUnion('status', [
            z.object({
                status: z.literal('resolved'),
                exploreName: z.string().optional(),
                dimensionIds: z.array(z.string()).optional(),
                metricIds: z.array(z.string()).optional(),
            }),
            z.object({
                status: z.literal('ambiguous'),
                candidates: z
                    .array(z.object({ exploreName: z.string().optional() }))
                    .optional(),
            }),
            z.object({
                status: z.literal('no_match'),
            }),
        ])
        .optional(),
});

export const SubmitResultToolCallDescription: FC<{
    args: unknown;
}> = ({ args }) => {
    const parsedArgs = submitResultArgsSchema.safeParse(args);
    const handoff = parsedArgs.success ? parsedArgs.data.handoff : undefined;

    if (handoff?.status === 'resolved') {
        const fieldCount =
            (handoff.dimensionIds?.length ?? 0) +
            (handoff.metricIds?.length ?? 0);
        return (
            <Text c="dimmed" size="xs">
                Picked explore{' '}
                {handoff.exploreName && (
                    <ToolCallChip mx={rem(2)}>
                        {handoff.exploreName}
                    </ToolCallChip>
                )}{' '}
                with {fieldCount} field{fieldCount === 1 ? '' : 's'}
            </Text>
        );
    }

    if (handoff?.status === 'ambiguous') {
        const candidateCount = handoff.candidates?.length ?? 0;
        return (
            <Text c="dimmed" size="xs">
                Found {candidateCount} plausible explore
                {candidateCount === 1 ? '' : 's'} to disambiguate
            </Text>
        );
    }

    if (handoff?.status === 'no_match') {
        return (
            <Text c="dimmed" size="xs">
                Found no matching explore or fields
            </Text>
        );
    }

    return (
        <Text c="dimmed" size="xs">
            Picked best explore and fields
        </Text>
    );
};

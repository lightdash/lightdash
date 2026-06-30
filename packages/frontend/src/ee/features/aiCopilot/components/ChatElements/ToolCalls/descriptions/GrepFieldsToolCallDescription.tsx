import { Group, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type GrepFieldsToolCallDescriptionProps = {
    patterns: string[];
    exploreName: string | null;
};

export const GrepFieldsToolCallDescription: FC<
    GrepFieldsToolCallDescriptionProps
> = ({ patterns, exploreName }) => (
    <Text c="dimmed" size="xs" component="div">
        <Group gap={rem(4)} align="center" wrap="wrap" display="inline-flex">
            Grepped fields matching
            {patterns.map((pattern, i) => (
                <ToolCallChip key={`${pattern}-${i}`} ff="monospace">
                    /{pattern}/
                </ToolCallChip>
            ))}
            {exploreName ? (
                <>
                    in <ToolCallChip>{exploreName}</ToolCallChip>
                </>
            ) : null}
        </Group>
    </Text>
);

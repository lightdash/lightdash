import {
    assertUnreachable,
    toolDescribeApiArgsSchema,
    toolGenerateUiArgsSchema,
    toolSearchApiArgsSchema,
} from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type GenerativeUiToolName = 'searchApi' | 'describeApi' | 'generateUi';

export const GenerativeUiToolCallDescription: FC<{
    toolName: GenerativeUiToolName;
    toolArgs: unknown;
}> = ({ toolName, toolArgs }) => {
    switch (toolName) {
        case 'searchApi': {
            const args = toolSearchApiArgsSchema.safeParse(toolArgs);
            return (
                <Text c="dimmed" size="xs">
                    Searched the API
                    {args.success ? (
                        <>
                            {' '}
                            for{' '}
                            <ToolCallChip mx={rem(2)}>
                                {args.data.query}
                            </ToolCallChip>
                        </>
                    ) : null}
                </Text>
            );
        }
        case 'describeApi': {
            const args = toolDescribeApiArgsSchema.safeParse(toolArgs);
            return (
                <Text c="dimmed" size="xs">
                    Read the API operation
                    {args.success ? (
                        <>
                            {' '}
                            <ToolCallChip mx={rem(2)} ff="monospace">
                                {args.data.operationId}
                            </ToolCallChip>
                        </>
                    ) : null}
                </Text>
            );
        }
        case 'generateUi': {
            const args = toolGenerateUiArgsSchema.safeParse(toolArgs);
            return (
                <Text c="dimmed" size="xs">
                    Prepared the form
                    {args.success ? (
                        <>
                            {' '}
                            <ToolCallChip mx={rem(2)}>
                                {args.data.title}
                            </ToolCallChip>
                        </>
                    ) : null}
                </Text>
            );
        }
        default:
            return assertUnreachable(toolName, 'Unknown generative UI tool');
    }
};

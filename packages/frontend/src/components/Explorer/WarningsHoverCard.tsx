import { type InlineError } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine/core';
import type { FC } from 'react';

type WarningsHoverCardContentProps = {
    type: 'warnings' | 'errors';
    warnings: InlineError[];
};

/**
 * Content for the warnings and errors HoverCard dropdown.
 * Shows a list of partial compilation warnings or errors with a header and scrollable list.
 */
const WarningsHoverCardContent: FC<WarningsHoverCardContentProps> = ({
    type,
    warnings,
}) => (
    <>
        <Text fz="sm" fw={600} mb="xs">
            Compilation {type} ({warnings.length})
        </Text>
        <Stack spacing="xs" sx={{ maxHeight: 250, overflow: 'auto' }}>
            {warnings.map((warning, idx) => (
                <Box
                    key={idx}
                    p="xs"
                    sx={(theme) => ({
                        backgroundColor: theme.colors.ldGray[0],
                        borderRadius: 4,
                    })}
                >
                    <Text fz="xs" sx={{ wordBreak: 'break-word' }}>
                        {warning.message}
                    </Text>
                </Box>
            ))}
        </Stack>
    </>
);

export default WarningsHoverCardContent;

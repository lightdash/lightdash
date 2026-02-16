import { type InlineError } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine-8/core';
import type { FC } from 'react';
import styles from './WarningsHoverCardContent.module.css';

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
        <Stack className={styles.warningsList} gap="xs" mah={250}>
            {warnings.map((warning, idx) => (
                <Box
                    className={styles.warningBox}
                    key={idx}
                    p="xs"
                    bg="ldGray.0"
                >
                    <Text className={styles.warningText} fz="xs">
                        {warning.message}
                    </Text>
                </Box>
            ))}
        </Stack>
    </>
);

export default WarningsHoverCardContent;

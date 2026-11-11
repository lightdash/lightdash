import { Box, Tooltip } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from './MantineIcon';

type Props = {
    /** From `usePivotColumnLimitMessage`. Renders nothing when null. */
    message: string | null;
};

const PivotColumnLimitWarning: FC<Props> = ({ message }) => {
    if (!message) return null;

    return (
        <Tooltip label={message} multiline maw={320} position="bottom">
            <Box
                component="span"
                role="img"
                aria-label="Some groups are not shown"
                display="inline-flex"
            >
                <MantineIcon icon={IconAlertCircle} color="yellow" size="lg" />
            </Box>
        </Tooltip>
    );
};

export default PivotColumnLimitWarning;

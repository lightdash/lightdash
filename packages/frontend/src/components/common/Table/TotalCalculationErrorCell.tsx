import { getErrorMessage, isApiError } from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';

const TotalCalculationErrorCell: FC<{ error: unknown }> = ({ error }) => {
    const message = isApiError(error)
        ? error.error.message
        : getErrorMessage(error);

    return (
        <Tooltip withinPortal multiline maw={500} label={message}>
            <Group
                component="span"
                gap={4}
                justify="flex-end"
                wrap="nowrap"
                c="red.6"
                w="100%"
                style={{ cursor: 'help' }}
                aria-label={`Total calculation error: ${message}`}
            >
                <MantineIcon icon={IconAlertCircle} size={14} />
                <Text component="span" size="xs" fw={600} c="inherit">
                    Error
                </Text>
            </Group>
        </Tooltip>
    );
};

export default TotalCalculationErrorCell;

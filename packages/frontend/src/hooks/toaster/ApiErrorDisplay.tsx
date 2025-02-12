import type { ApiErrorDetail } from '@lightdash/common';
import {
    ActionIcon,
    CopyButton,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import MantineIcon from '../../components/common/MantineIcon';

const ApiErrorDisplay = ({ apiError }: { apiError: ApiErrorDetail }) => {
    return apiError.sentryEventId || apiError.sentryTraceId ? (
        <Stack spacing="xxs">
            <Text mb={0}>{apiError.message}</Text>
            <Text mb={0} weight="bold">
                Contact support with the following information:
            </Text>
            <Group spacing="xxs" align="flex-start">
                <Text mb={0} weight="bold">
                    Error ID: {apiError.sentryEventId || 'n/a'}
                    <br />
                    Trace ID: {apiError.sentryTraceId || 'n/a'}
                </Text>
                <CopyButton
                    value={`Error ID: ${
                        apiError.sentryEventId || 'n/a'
                    } Trace ID: ${apiError.sentryTraceId || 'n/a'}`}
                >
                    {({ copied, copy }) => (
                        <Tooltip
                            label={copied ? 'Copied' : 'Copy error ID'}
                            withArrow
                            position="right"
                        >
                            <ActionIcon
                                size="xs"
                                onClick={copy}
                                variant={'transparent'}
                            >
                                <MantineIcon
                                    color={'white'}
                                    icon={copied ? IconCheck : IconCopy}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            </Group>
        </Stack>
    ) : (
        <>{apiError.message}</>
    );
};

export default ApiErrorDisplay;

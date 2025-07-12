import type { ApiErrorDetail } from '@lightdash/common';
import {
    ActionIcon,
    CopyButton,
    Group,
    Modal,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import MantineIcon from '../../components/common/MantineIcon';
import { SnowflakeFormInput } from '../../components/UserSettings/MyWarehouseConnectionsPanel/WarehouseFormInputs';

const ApiErrorDisplay = ({
    apiError,
    onClose,
}: {
    apiError: ApiErrorDetail;
    onClose?: () => void;
}) => {
    switch (apiError.name) {
        case 'SnowflakeTokenError':
            return (
                <>
                    <Modal
                        opened={true}
                        onClose={() => onClose?.()}
                        title="Snowflake Authentication Error"
                        centered
                        size="md"
                    >
                        <Stack spacing="md">
                            <Text mb={0} color="red">
                                {apiError.message}
                            </Text>

                            <Text mb={0}>
                                You can try to reauthenticate with Snowflake:
                            </Text>

                            <SnowflakeFormInput
                                onClose={() => {
                                    onClose?.();
                                }}
                            />
                        </Stack>
                    </Modal>
                    <Text mb={0}>{apiError.message}</Text>
                </>
            );
        default:
            break;
    }
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

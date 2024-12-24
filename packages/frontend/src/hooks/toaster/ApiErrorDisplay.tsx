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
    return apiError.id ? (
        <Stack spacing="xxs">
            <Text mb={0}>{apiError.message}</Text>
            <Text mb={0} weight="bold">
                You can contact support with this error ID
            </Text>
            <Group spacing="xxs">
                <Text mb={0} weight="bold">
                    {apiError.id}
                </Text>
                <CopyButton value={apiError.id}>
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

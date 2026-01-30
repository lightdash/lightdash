import { type ApiErrorDetail, LightdashMode } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    CopyButton,
    Group,
    Modal,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCheck, IconCopy, IconSos } from '@tabler/icons-react';
import MantineIcon from '../../components/common/MantineIcon';
import { SnowflakeFormInput } from '../../components/UserSettings/MyWarehouseConnectionsPanel/WarehouseFormInputs';
import SupportDrawerContent from '../../providers/SupportDrawer/SupportDrawerContent';
import useHealth from '../health/useHealth';

const ApiErrorDisplay = ({
    apiError,
    onClose,
}: {
    apiError: ApiErrorDetail;
    onClose?: () => void;
}) => {
    const theme = useMantineTheme();
    const isDark = theme.colorScheme === 'dark';
    const health = useHealth();
    const isCloudCustomer = health.data?.mode === LightdashMode.CLOUD_BETA;
    const isDevelopment = health.data?.mode === LightdashMode.DEV;

    switch (apiError.name) {
        case 'SnowflakeTokenError':
            return (
                <>
                    {/* FIXME: Replace with MantineModal when we migrate fully to Mantine 8 */}
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
    const showSupportButton = isCloudCustomer || isDevelopment;

    if (apiError.sentryEventId || apiError.sentryTraceId) {
        // Cloud/dev: show button only, no IDs
        if (showSupportButton) {
            return (
                <Stack spacing="xxs" align="start">
                    <Text mb={0} so>
                        {apiError.message}
                    </Text>
                    <Button
                        size="xs"
                        compact
                        variant="outline"
                        color="red.4"
                        leftIcon={<MantineIcon color="red.4" icon={IconSos} />}
                        onClick={() => {
                            modals.open({
                                title: 'Share with Lightdash Support',
                                size: 'lg',
                                children: <SupportDrawerContent />,
                                yOffset: 100,
                                zIndex: 1000,
                            });
                        }}
                    >
                        <Text color="red.6">Notify support</Text>
                    </Button>
                </Stack>
            );
        }

        // Self-hosted: show IDs with copy button
        return (
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
                                        color={isDark ? 'white' : 'gray.7'}
                                        icon={copied ? IconCheck : IconCopy}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                </Group>
            </Stack>
        );
    }

    return <span>{apiError.message}</span>;
};

export default ApiErrorDisplay;

import { type ApiErrorDetail, LightdashMode } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
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
import { IconCheck, IconCopy, IconSpeakerphone } from '@tabler/icons-react';
import MantineIcon from '../../components/common/MantineIcon';
import { SnowflakeFormInput } from '../../components/UserSettings/MyWarehouseConnectionsPanel/WarehouseFormInputs';
import SupportDrawerContent from '../../providers/SupportDrawer/SupportDrawerContent';
import { useGoogleLoginPopup } from '../gdrive/useGdrive';
import useHealth from '../health/useHealth';

const CopyErrorButton = ({
    value,
    color,
}: {
    value: string;
    color: string;
}) => (
    <CopyButton value={value}>
        {({ copied, copy }) => (
            <Tooltip
                label={copied ? 'Copied' : 'Copy error'}
                withArrow
                position="right"
            >
                <ActionIcon size="xs" onClick={copy} variant="transparent">
                    <MantineIcon
                        color={color}
                        icon={copied ? IconCheck : IconCopy}
                    />
                </ActionIcon>
            </Tooltip>
        )}
    </CopyButton>
);

const GoogleSheetsReauthMessage = ({ message }: { message: string }) => {
    const { mutate: openLoginPopup } = useGoogleLoginPopup('gdrive');

    return (
        <Text mb={0}>
            {message}{' '}
            <Anchor
                component="button"
                type="button"
                onClick={() => openLoginPopup()}
            >
                Re-authenticate with Google
            </Anchor>
        </Text>
    );
};

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
    const isNotMultiTenantCloud = !(
        health.data?.siteUrl === 'https://app.lightdash.cloud' ||
        health.data?.siteUrl === 'https://eu1.lightdash.cloud'
    );

    switch (apiError.name) {
        case 'GoogleSheetsScopeError':
            return <GoogleSheetsReauthMessage message={apiError.message} />;
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
    const showSupportButton =
        (isCloudCustomer && isNotMultiTenantCloud) || isDevelopment;

    if (apiError.sentryEventId || apiError.sentryTraceId) {
        // Cloud/dev: show button only, no IDs
        if (showSupportButton) {
            return (
                <Stack spacing="xxs" align="start">
                    <Text mb={0} color="red.6">
                        {apiError.message}
                    </Text>
                    <Group spacing="xs">
                        <Button
                            size="xs"
                            compact
                            variant="outline"
                            color="red.6"
                            leftIcon={
                                <MantineIcon
                                    color="red.6"
                                    icon={IconSpeakerphone}
                                />
                            }
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
                            <Text color="red.6" weight="lighter">
                                Notify support
                            </Text>
                        </Button>
                        <CopyErrorButton
                            value={`${apiError.message}\nError ID: ${
                                apiError.sentryEventId || 'n/a'
                            }\nTrace ID: ${apiError.sentryTraceId || 'n/a'}`}
                            color="red.6"
                        />
                    </Group>
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
                    <CopyErrorButton
                        value={`${apiError.message}\nError ID: ${
                            apiError.sentryEventId || 'n/a'
                        }\nTrace ID: ${apiError.sentryTraceId || 'n/a'}`}
                        color={isDark ? 'white' : 'gray.7'}
                    />
                </Group>
            </Stack>
        );
    }

    return <span>{apiError.message}</span>;
};

export default ApiErrorDisplay;

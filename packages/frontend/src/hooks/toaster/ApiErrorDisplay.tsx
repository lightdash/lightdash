import { LightdashMode, type ApiErrorDetail } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Code,
    CopyButton,
    Group,
    Modal,
    Stack,
    Text,
    Tooltip,
    useComputedColorScheme,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { defaultContext } from '@tanstack/react-query';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { TextWithInlineLinks } from '../../components/common/TextWithInlineLinks';
import { SnowflakeFormInput } from '../../components/UserSettings/MyWarehouseConnectionsPanel/WarehouseFormInputs';
import SupportDrawerContent from '../../providers/SupportDrawer/SupportDrawerContent';
import { getFromInMemoryStorage } from '../../utils/inMemoryStorage';
import { useGoogleLoginPopup } from '../gdrive/useGdrive';
import useHealth from '../health/useHealth';
import styles from './ApiErrorDisplay.module.css';
import { errorClipboardValue } from './errorClipboardValue';

const LIGHTDASH_SDK_VERSION_LOCAL_STORAGE_KEY = '__lightdash_sdk_version';

/** Clamped toast message; when the message overflows the clamp it can be
 *  expanded in place — the toast root grows in width and height via the
 *  [data-toast-expanded] hook in useToaster.module.css. */
const ErrorMessage = ({
    apiError,
    withCopy = true,
    defaultExpanded = false,
}: {
    apiError: ApiErrorDetail;
    withCopy?: boolean;
    defaultExpanded?: boolean;
}) => {
    const messageRef = useRef<HTMLParagraphElement>(null);
    const [isClamped, setIsClamped] = useState(false);
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    useLayoutEffect(() => {
        if (isExpanded) return;
        const el = messageRef.current;
        if (!el) return;
        // Modern line-clamp collapses the clipped lines out of layout, so
        // scrollHeight can't detect truncation; measure an unclamped clone.
        const clone = el.cloneNode(true) as HTMLElement;
        clone.style.setProperty('-webkit-line-clamp', 'unset');
        clone.style.setProperty('line-clamp', 'unset');
        clone.style.setProperty('display', 'block');
        clone.style.setProperty('overflow', 'visible');
        clone.style.setProperty('position', 'absolute');
        clone.style.setProperty('visibility', 'hidden');
        clone.style.setProperty(
            'width',
            `${el.getBoundingClientRect().width}px`,
        );
        el.parentElement?.appendChild(clone);
        setIsClamped(clone.scrollHeight > el.clientHeight + 1);
        clone.remove();
    }, [apiError.message, isExpanded]);

    return (
        <>
            <Text
                ref={messageRef}
                mb={0}
                fz="xs"
                data-toast-expanded={isExpanded || undefined}
                className={
                    isExpanded ? styles.expandedMessage : styles.clampedMessage
                }
            >
                <TextWithInlineLinks text={apiError.message} />
            </Text>
            {(isClamped || isExpanded) && (
                <Group gap="xs">
                    <Anchor
                        component="button"
                        type="button"
                        fz="xs"
                        c="ldGray.7"
                        underline="always"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? 'Show less' : 'View full error'}
                    </Anchor>
                    {withCopy && (
                        <CopyErrorButton
                            value={errorClipboardValue(apiError)}
                            color="ldGray.7"
                        />
                    )}
                </Group>
            )}
        </>
    );
};

export const CopyErrorButton = ({
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
                <ActionIcon
                    aria-label="Copy error details"
                    color="ldGray.6"
                    size="xs"
                    onClick={copy}
                    variant="transparent"
                >
                    <MantineIcon
                        color={color}
                        icon={copied ? IconCheck : IconCopy}
                    />
                </ActionIcon>
            </Tooltip>
        )}
    </CopyButton>
);

const CopyErrorIdButton = ({ value }: { value: string }) => (
    <CopyButton value={value}>
        {({ copied, copy }) => (
            <Button
                size="compact-xs"
                variant="subtle"
                leftSection={
                    <MantineIcon icon={copied ? IconCheck : IconCopy} />
                }
                onClick={copy}
            >
                {copied ? 'Copied' : 'Copy error'}
            </Button>
        )}
    </CopyButton>
);

const GoogleSheetsReauthMessage = ({ message }: { message: string }) => {
    const { mutate: openLoginPopup } = useGoogleLoginPopup('gdrive');

    return (
        <Text mb={0} fz="xs">
            {message}{' '}
            <Anchor
                inherit
                component="button"
                type="button"
                onClick={() => openLoginPopup()}
            >
                Re-authenticate with Google
            </Anchor>
        </Text>
    );
};

const ApiErrorDisplayStatic = ({
    apiError,
    defaultExpanded,
}: {
    apiError: ApiErrorDetail;
    defaultExpanded?: boolean;
}) => {
    switch (apiError.name) {
        case 'GoogleSheetsScopeError':
            return (
                <Text mb={0} fz="xs">
                    {apiError.message}
                </Text>
            );
        default:
            break;
    }

    if (apiError.sentryEventId || apiError.sentryTraceId) {
        return (
            <Stack gap="xxs">
                <ErrorMessage
                    apiError={apiError}
                    withCopy={false}
                    defaultExpanded={defaultExpanded}
                />
                <Text mb={0} fz="xs" fw="bold">
                    Contact support with the following information:
                </Text>
                <Group gap="xxs" align="flex-start">
                    <Text mb={0} fz="xs" fw="bold">
                        Error ID:{' '}
                        <Code fz="xs" className={styles.code}>
                            {apiError.sentryEventId || 'n/a'}
                        </Code>
                        <br />
                        Trace ID:{' '}
                        <Code fz="xs" className={styles.code}>
                            {apiError.sentryTraceId || 'n/a'}
                        </Code>
                    </Text>
                    <CopyErrorButton
                        value={errorClipboardValue(apiError)}
                        color="ldGray.7"
                    />
                </Group>
            </Stack>
        );
    }

    return (
        <ErrorMessage apiError={apiError} defaultExpanded={defaultExpanded} />
    );
};

const ApiErrorDisplayWithHealth = ({
    apiError,
    onClose,
    defaultExpanded,
}: {
    apiError: ApiErrorDetail;
    onClose?: () => void;
    defaultExpanded?: boolean;
}) => {
    const isDark = useComputedColorScheme() === 'dark';
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
                    <Modal
                        opened={true}
                        onClose={() => onClose?.()}
                        title="Snowflake Authentication Error"
                        centered
                        size="md"
                    >
                        <Stack gap="md">
                            <Text mb={0} c="red">
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
                    <Text mb={0} fz="xs">
                        {apiError.message}
                    </Text>
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
                <Stack gap="xxs" align="start">
                    <ErrorMessage
                        apiError={apiError}
                        withCopy={false}
                        defaultExpanded={defaultExpanded}
                    />
                    <Group gap="xs">
                        <Button
                            size="compact-xs"
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
                            Notify support
                        </Button>
                        <CopyErrorIdButton
                            value={errorClipboardValue(apiError)}
                        />
                    </Group>
                </Stack>
            );
        }

        // Self-hosted: show IDs with copy button
        return (
            <Stack gap="xxs">
                <ErrorMessage
                    apiError={apiError}
                    withCopy={false}
                    defaultExpanded={defaultExpanded}
                />
                <Text mb={0} fz="xs" fw="bold">
                    Contact support with the following information:
                </Text>
                <Group gap="xxs" align="flex-start">
                    <Text mb={0} fz="xs" fw="bold">
                        Error ID:{' '}
                        <Code fz="xs" className={styles.code}>
                            {apiError.sentryEventId || 'n/a'}
                        </Code>
                        <br />
                        Trace ID:{' '}
                        <Code fz="xs" className={styles.code}>
                            {apiError.sentryTraceId || 'n/a'}
                        </Code>
                    </Text>
                    <CopyErrorButton
                        value={errorClipboardValue(apiError)}
                        color={isDark ? 'foreground.0' : 'ldGray.7'}
                    />
                </Group>
            </Stack>
        );
    }

    return (
        <ErrorMessage apiError={apiError} defaultExpanded={defaultExpanded} />
    );
};

const ApiErrorDisplay = ({
    apiError,
    onClose,
    defaultExpanded,
}: {
    apiError: ApiErrorDetail;
    onClose?: () => void;
    defaultExpanded?: boolean;
}) => {
    const queryClient = useContext(defaultContext);
    const isSdk =
        getFromInMemoryStorage<string>(
            LIGHTDASH_SDK_VERSION_LOCAL_STORAGE_KEY,
        ) !== undefined;

    if (isSdk || !queryClient) {
        return (
            <ApiErrorDisplayStatic
                apiError={apiError}
                defaultExpanded={defaultExpanded}
            />
        );
    }

    return (
        <ApiErrorDisplayWithHealth
            apiError={apiError}
            onClose={onClose}
            defaultExpanded={defaultExpanded}
        />
    );
};

export default ApiErrorDisplay;

import {
    WarehouseTypes,
    type DepositSnowflakeCredentials,
    type WarehouseConnectInventory,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    Code,
    CopyButton,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { IconAlertTriangle, IconCheck, IconCopy } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import {
    useMintWarehouseConnectCode,
    useWarehouseConnectCodeClaim,
} from '../../../hooks/useWarehouseConnectCode';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import {
    buildSnowflakeConnectCommand,
    SNOWFLAKE_CLI_INSTALL_COMMAND,
} from './snowflakeCliSso';

const CopyableCommand: FC<{ command: string }> = ({ command }) => (
    <Group gap="xs" align="flex-start" wrap="nowrap">
        <Code block flex={1} miw={0}>
            {command}
        </Code>
        <CopyButton value={command}>
            {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
                    <ActionIcon
                        variant="subtle"
                        color={copied ? 'green' : 'gray'}
                        onClick={copy}
                        aria-label="Copy command"
                    >
                        <MantineIcon icon={copied ? IconCheck : IconCopy} />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    </Group>
);

type Props = {
    account: string;
    disabled: boolean;
    connectedCredentials: DepositSnowflakeCredentials | null;
    onDeposited: (credentials: DepositSnowflakeCredentials) => void;
};

const withCurrentValue = (options: string[], current: string | undefined) =>
    current && !options.includes(current) ? [current, ...options] : options;

const SnowflakeCliSsoPanel: FC<Props> = ({
    account,
    disabled,
    connectedCredentials,
    onDeposited,
}) => {
    const { health } = useApp();
    const form = useFormContext();
    const siteUrl = health.data?.siteUrl ?? '';
    const mint = useMintWarehouseConnectCode();
    const [code, setCode] = useState<string | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState<number | null>(
        null,
    );
    const [claimed, setClaimed] = useState(false);
    const [inventory, setInventory] =
        useState<WarehouseConnectInventory | null>(null);

    const isConnected = connectedCredentials !== null;
    const isExpired = secondsRemaining !== null && secondsRemaining <= 0;
    const isPolling = !!code && !claimed && !isConnected && !isExpired;

    const claim = useWarehouseConnectCodeClaim(code, isPolling);

    useEffect(() => {
        if (!claimed && claim.data?.status === 'deposited') {
            setClaimed(true);
            setInventory(claim.data.inventory);
            onDeposited(claim.data.credentials);
        }
    }, [claimed, claim.data, onDeposited]);

    useEffect(() => {
        if (secondsRemaining === null || secondsRemaining <= 0)
            return undefined;
        const interval = setInterval(() => {
            setSecondsRemaining((prev) =>
                prev === null ? null : Math.max(0, prev - 1),
            );
        }, 1000);
        return () => clearInterval(interval);
    }, [secondsRemaining]);

    const handleGenerate = async () => {
        const result = await mint.mutateAsync();
        setClaimed(false);
        setCode(result.code);
        const expiry = new Date(result.expiresAt).getTime();
        setSecondsRemaining(
            Math.max(0, Math.round((expiry - Date.now()) / 1000)),
        );
    };

    if (isConnected) {
        const warehouseValues =
            form.values.warehouse?.type === WarehouseTypes.SNOWFLAKE
                ? form.values.warehouse
                : undefined;
        return (
            <Stack gap="md">
                <Alert
                    color="green"
                    icon={<MantineIcon icon={IconCheck} />}
                    title={`Connected as ${connectedCredentials.user} ✓`}
                >
                    <Text size="sm">
                        Choose where Lightdash should query, then deploy your
                        project to finish.
                    </Text>
                </Alert>
                <Select
                    label="Database"
                    description="This is the database name."
                    data={withCurrentValue(
                        inventory?.databases ?? [],
                        warehouseValues?.database,
                    )}
                    searchable
                    required
                    disabled={disabled}
                    {...form.getInputProps('warehouse.database')}
                />
                <Select
                    label="Warehouse"
                    description="This is the warehouse name."
                    data={withCurrentValue(
                        inventory?.warehouses ?? [],
                        warehouseValues?.warehouse,
                    )}
                    searchable
                    required
                    disabled={disabled}
                    {...form.getInputProps('warehouse.warehouse')}
                />
                <Select
                    label="Role"
                    description="This is the role to assume when running queries."
                    data={withCurrentValue(
                        inventory?.roles ?? [],
                        warehouseValues?.role,
                    )}
                    searchable
                    clearable
                    disabled={disabled}
                    {...form.getInputProps('warehouse.role')}
                />
                <TextInput
                    label="Schema"
                    description="This is the schema name."
                    required
                    disabled={disabled}
                    {...form.getInputProps('warehouse.schema')}
                />
            </Stack>
        );
    }

    const isDev = import.meta.env.DEV;
    const connectCommand = code
        ? buildSnowflakeConnectCommand({ siteUrl, code, account, dev: isDev })
        : '';

    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                The quickest, most secure way to connect. Run these two commands
                in your terminal — our CLI signs you into Snowflake in your
                browser and sets up a secure, revocable connection for you, with
                no credentials to copy by hand.
            </Text>

            {!code ? (
                <Group>
                    <Button
                        loading={mint.isLoading}
                        disabled={disabled || !account}
                        onClick={() => void handleGenerate()}
                    >
                        Generate connect code
                    </Button>
                    {!account && (
                        <Text size="xs" c="dimmed">
                            Enter your account above to generate a code.
                        </Text>
                    )}
                </Group>
            ) : (
                <Stack gap="md">
                    {!isDev && (
                        <Stack gap="xs">
                            <Text size="sm" fw={500}>
                                1. Install the CLI
                            </Text>
                            <CopyableCommand
                                command={SNOWFLAKE_CLI_INSTALL_COMMAND}
                            />
                        </Stack>
                    )}
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            {isDev
                                ? 'Connect with SSO (dev CLI — run from the repo root)'
                                : '2. Connect with SSO'}
                        </Text>
                        <CopyableCommand command={connectCommand} />
                    </Stack>

                    <Group gap="xs">
                        <Text size="xs" c="dimmed">
                            {isExpired
                                ? 'Code expired'
                                : `Code expires in ${secondsRemaining ?? 0}s`}
                        </Text>
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            loading={mint.isLoading}
                            onClick={() => void handleGenerate()}
                        >
                            Generate new code
                        </Button>
                    </Group>

                    {isPolling && (
                        <Group gap="xs">
                            <Loader size="xs" />
                            <Text size="sm" c="dimmed">
                                Waiting for the CLI to finish signing in…
                            </Text>
                        </Group>
                    )}

                    {claim.isError && !isExpired && (
                        <Alert
                            color="red"
                            icon={<MantineIcon icon={IconAlertTriangle} />}
                            title="Connection code no longer valid"
                        >
                            Generate a new code and try again.
                        </Alert>
                    )}
                </Stack>
            )}
        </Stack>
    );
};

export default SnowflakeCliSsoPanel;

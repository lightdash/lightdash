import {
    WarehouseTypes,
    type DepositSnowflakeCredentials,
    type WarehouseConnectInventory,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Autocomplete,
    Badge,
    Button,
    Code,
    Combobox,
    CopyButton,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Tooltip,
    type ComboboxItem,
} from '@mantine-8/core';
import { IconAlertTriangle, IconCheck, IconCopy } from '@tabler/icons-react';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import {
    useMintWarehouseConnectCode,
    useWarehouseConnectCodeClaim,
} from '../../../hooks/useWarehouseConnectCode';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';
import {
    buildSnowflakeConnectCommand,
    recommendedWarehouseName,
    SNOWFLAKE_CLI_INSTALL_COMMAND,
    warehouseSecondaryText,
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

const twoLineOption = (
    label: string,
    secondary: string | null,
    badge: ReactNode,
): ReactNode => (
    <Group justify="space-between" wrap="nowrap" gap="xs" w="100%">
        <Stack gap={0} miw={0}>
            <Text size="sm" truncate="end">
                {label}
            </Text>
            {secondary && (
                <Text size="xs" c="dimmed" truncate="end">
                    {secondary}
                </Text>
            )}
        </Stack>
        {badge}
    </Group>
);

const defaultBadge = (
    <Badge size="xs" color="blue" variant="light" radius="sm">
        Your Snowflake default
    </Badge>
);

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
        const databaseMeta = new Map(
            (inventory?.databases ?? []).map((d) => [d.name, d]),
        );
        const warehouseMeta = new Map(
            (inventory?.warehouses ?? []).map((w) => [w.name, w]),
        );
        const defaultRoleNames = new Set(
            (inventory?.roles ?? [])
                .filter((r) => r.isDefault)
                .map((r) => r.name)
                .concat(
                    connectedCredentials.role
                        ? [connectedCredentials.role]
                        : [],
                ),
        );
        const recommendedWarehouse = recommendedWarehouseName(
            inventory?.warehouses ?? [],
        );
        const schemaOptions = [
            ...new Set(
                (inventory?.schemas ?? [])
                    .filter(
                        (schema) =>
                            !warehouseValues?.database ||
                            schema.database === warehouseValues.database,
                    )
                    .map((schema) => schema.name),
            ),
        ];
        const renderDatabaseOption = ({ option }: { option: ComboboxItem }) =>
            twoLineOption(
                option.label,
                databaseMeta.get(option.value)?.comment ?? null,
                option.value === connectedCredentials.database
                    ? defaultBadge
                    : null,
            );
        const renderWarehouseOption = ({
            option,
        }: {
            option: ComboboxItem;
        }) => {
            const meta = warehouseMeta.get(option.value);
            const badge =
                option.value === connectedCredentials.warehouse ? (
                    defaultBadge
                ) : option.value === recommendedWarehouse ? (
                    <Badge size="xs" color="green" variant="light" radius="sm">
                        Recommended · cheapest
                    </Badge>
                ) : null;
            return twoLineOption(
                option.label,
                meta ? warehouseSecondaryText(meta) : null,
                badge,
            );
        };
        const renderRoleOption = ({ option }: { option: ComboboxItem }) =>
            twoLineOption(
                option.label,
                null,
                defaultRoleNames.has(option.value) ? defaultBadge : null,
            );
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
                    description="Where your data lives. You can add more later."
                    data={withCurrentValue(
                        (inventory?.databases ?? []).map((d) => d.name),
                        warehouseValues?.database,
                    )}
                    renderOption={renderDatabaseOption}
                    searchable
                    nothingFoundMessage="No databases match"
                    required
                    disabled={disabled}
                    {...form.getInputProps('warehouse.database')}
                />
                <Select
                    label="Warehouse"
                    description="The compute Snowflake uses to run queries. A small one is fine for BI."
                    data={withCurrentValue(
                        (inventory?.warehouses ?? []).map((w) => w.name),
                        warehouseValues?.warehouse,
                    )}
                    renderOption={renderWarehouseOption}
                    searchable
                    nothingFoundMessage="No warehouses match"
                    required
                    disabled={disabled}
                    {...form.getInputProps('warehouse.warehouse')}
                />
                <Select
                    label="Role"
                    description="Controls what Lightdash can see. A read-only role is best."
                    data={withCurrentValue(
                        (inventory?.roles ?? []).map((r) => r.name),
                        warehouseValues?.role,
                    )}
                    renderOption={renderRoleOption}
                    searchable
                    nothingFoundMessage="No roles match"
                    clearable
                    disabled={disabled}
                    {...form.getInputProps('warehouse.role')}
                />
                <Autocomplete
                    label="Schema"
                    description="We'll start with this schema — you can add more later."
                    data={schemaOptions}
                    rightSection={<Combobox.Chevron />}
                    rightSectionPointerEvents="none"
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

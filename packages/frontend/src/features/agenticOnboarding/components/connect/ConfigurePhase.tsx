import {
    type ConnectionCheckId,
    type ConnectionDiagnosticResult,
    type OnboardingConnectionInventory,
    type OnboardingConnectionValues,
    type OnboardingSchemaSummary,
} from '@lightdash/common';
import {
    Alert,
    Badge,
    Button,
    Group,
    Select,
    Stack,
    Text,
    type ComboboxData,
    type ComboboxItem,
} from '@mantine-8/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useValidateConnection } from '../../hooks/useValidateConnection';
import {
    buildDatabaseSelectData,
    defaultValueName,
    initialSelections,
    isAdminRole,
    largestSchemaName,
    recommendedWarehouseName,
    schemaTotals,
    warehouseSecondaryText,
    type ConfigureSelections,
    type ParsedConnectResult,
} from '../../utils/configureHelpers';
import ConnectionTestChecklist from './ConnectionTestChecklist';
import ConnectionTestDiagnosis from './ConnectionTestDiagnosis';
import LeastPrivilegeGuidance from './LeastPrivilegeGuidance';

const VALIDATION_DEBOUNCE_MS = 600;

const VALIDATION_CHECKS: { id: ConnectionCheckId; label: string }[] = [
    { id: 'open_connection', label: 'Open secure connection' },
    { id: 'authenticate', label: 'Authenticate' },
    { id: 'use_warehouse', label: 'Use warehouse' },
    { id: 'use_database', label: 'Use database' },
    { id: 'list_schemas', label: 'List schemas' },
];

type ValidationState = {
    key: string;
    database: string | null;
    diagnostic: ConnectionDiagnosticResult;
    schemas: OnboardingSchemaSummary[] | null;
    inventory: OnboardingConnectionInventory;
};

type ConfigurePhaseProps = {
    projectUuid: string;
    parsed: ParsedConnectResult;
    isSubmitting: boolean;
    onSubmit: (values: OnboardingConnectionValues) => void;
    // Mints a fresh connect code and returns to the CLI SSO wait so the user can
    // re-authenticate when their stored Snowflake credential has expired.
    onReconnect: () => void;
};

const validationKey = (selections: ConfigureSelections): string =>
    JSON.stringify({
        database: selections.database,
        warehouse: selections.warehouse,
        role: selections.role,
    });

const shouldValidate = (selections: ConfigureSelections): boolean =>
    selections.role !== null ||
    (selections.database !== null && selections.warehouse !== null);

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

const ConfigurePhase: FC<ConfigurePhaseProps> = ({
    projectUuid,
    parsed,
    isSubmitting,
    onSubmit,
    onReconnect,
}) => {
    const validate = useValidateConnection(projectUuid);
    const validateRef = useRef(validate);
    validateRef.current = validate;

    const [selections, setSelections] = useState<ConfigureSelections>(() =>
        initialSelections(parsed.connectionValues, parsed.inventory),
    );
    const [validation, setValidation] = useState<ValidationState | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [validationErrored, setValidationErrored] = useState(false);

    const latestKeyRef = useRef<string | null>(null);
    const submittedRef = useRef(false);

    const inventory = validation?.inventory ?? parsed.inventory;
    // Schemas are database-scoped: only treat the validation's schemas (and
    // totals) as current when they were discovered for the selected database.
    // Otherwise the previous database's schemas linger during the next
    // debounce + in-flight window.
    const schemasAreCurrent =
        validation !== null && validation.database === selections.database;
    const schemas = schemasAreCurrent ? validation.schemas : null;

    // A failed `authenticate` check means the stored Snowflake credential is
    // dead (expired/revoked) — retrying is futile, the user must reconnect.
    const authFailedCheck =
        validation?.diagnostic.checks.find(
            (check) => check.id === 'authenticate' && check.status === 'failed',
        ) ?? null;
    const credentialExpired = authFailedCheck !== null;

    const runValidation = async (
        key: string,
        connectionValues: OnboardingConnectionValues,
    ) => {
        if (submittedRef.current) return;
        latestKeyRef.current = key;
        setIsValidating(true);
        setValidationErrored(false);
        try {
            const result = await validateRef.current.mutateAsync({
                connectionValues,
            });
            if (latestKeyRef.current !== key || submittedRef.current) return;
            setValidation((prev) => ({
                key,
                database: connectionValues.database,
                diagnostic: result.diagnostic,
                schemas: result.schemas,
                inventory:
                    result.inventory ?? prev?.inventory ?? parsed.inventory,
            }));
            if (result.inventory || result.schemas) {
                reconcileSelections(result.inventory, result.schemas);
            }
        } catch {
            if (latestKeyRef.current !== key || submittedRef.current) return;
            setValidationErrored(true);
        } finally {
            if (latestKeyRef.current === key) setIsValidating(false);
        }
    };

    const reconcileSelections = (
        newInventory: OnboardingConnectionInventory | null,
        newSchemas: OnboardingSchemaSummary[] | null,
    ) => {
        setSelections((prev) => {
            let next = prev;
            if (newInventory) {
                const dbNames = new Set(
                    newInventory.databases.map((d) => d.name),
                );
                const whNames = new Set(
                    newInventory.warehouses.map((w) => w.name),
                );
                const roleNames = new Set(
                    newInventory.roles.map((r) => r.name),
                );
                const nextDatabase =
                    next.database && !dbNames.has(next.database)
                        ? null
                        : next.database;
                next = {
                    ...next,
                    database: nextDatabase,
                    warehouse:
                        next.warehouse && !whNames.has(next.warehouse)
                            ? null
                            : next.warehouse,
                    role:
                        next.role && !roleNames.has(next.role)
                            ? null
                            : next.role,
                    // A dropped database invalidates its schema selection.
                    schema: nextDatabase !== prev.database ? null : next.schema,
                };
            }
            if (newSchemas && newSchemas.length > 0) {
                const schemaNames = new Set(newSchemas.map((s) => s.name));
                const kept =
                    next.schema && schemaNames.has(next.schema)
                        ? next.schema
                        : null;
                next = {
                    ...next,
                    schema: kept ?? largestSchemaName(newSchemas),
                };
            }
            return next;
        });
    };

    const { database, warehouse, role, schema } = selections;

    // Debounced live validation: synchronises picked values with the backend
    // validation endpoint (an external system), not server->state mirroring.
    // Stale responses are ignored via latestKeyRef.
    useEffect(() => {
        if (submittedRef.current) return undefined;
        if (!shouldValidate(selections)) return undefined;
        // Don't keep hammering a dead credential — wait for reconnect/retry.
        if (credentialExpired) return undefined;
        const timeout = setTimeout(() => {
            void runValidation(validationKey(selections), {
                database,
                warehouse,
                role,
                schema: null,
            });
        }, VALIDATION_DEBOUNCE_MS);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [database, warehouse, role, credentialExpired]);

    const setField = (field: keyof ConfigureSelections, value: string | null) =>
        setSelections((prev) => ({ ...prev, [field]: value }));

    // A schema belongs to a database, so a database change must clear it
    // immediately rather than leaving the old database's schema selected.
    const handleDatabaseChange = (value: string | null) =>
        setSelections((prev) =>
            prev.database === value
                ? prev
                : { ...prev, database: value, schema: null },
        );

    const databaseData = useMemo<ComboboxData>(
        () => buildDatabaseSelectData(inventory.databases),
        [inventory.databases],
    );
    const warehouseData = useMemo<ComboboxItem[]>(
        () =>
            inventory.warehouses.map((w) => ({ value: w.name, label: w.name })),
        [inventory.warehouses],
    );
    const roleData = useMemo<ComboboxItem[]>(
        () => inventory.roles.map((r) => ({ value: r.name, label: r.name })),
        [inventory.roles],
    );
    const schemaData = useMemo<ComboboxItem[]>(
        () =>
            (schemas ?? []).map((s) => ({
                value: s.name,
                label: `${s.name} — ${s.tableCount} ${
                    s.tableCount === 1 ? 'table' : 'tables'
                }`,
            })),
        [schemas],
    );

    const databaseMeta = useMemo(
        () => new Map(inventory.databases.map((d) => [d.name, d])),
        [inventory.databases],
    );
    const warehouseMeta = useMemo(
        () => new Map(inventory.warehouses.map((w) => [w.name, w])),
        [inventory.warehouses],
    );

    const defaultDatabase = defaultValueName(
        parsed.connectionValues,
        parsed.connectionValueSources,
        'database',
    );
    const defaultWarehouse = defaultValueName(
        parsed.connectionValues,
        parsed.connectionValueSources,
        'warehouse',
    );
    const defaultRole = defaultValueName(
        parsed.connectionValues,
        parsed.connectionValueSources,
        'role',
    );
    const defaultRoleNames = useMemo(
        () =>
            new Set(
                inventory.roles
                    .filter((r) => r.isDefault)
                    .map((r) => r.name)
                    .concat(defaultRole ? [defaultRole] : []),
            ),
        [inventory.roles, defaultRole],
    );

    const recommendedWarehouse = useMemo(
        () => recommendedWarehouseName(inventory.warehouses),
        [inventory.warehouses],
    );

    const defaultBadge = (
        <Badge size="xs" color="blue" variant="light" radius="sm">
            Your Snowflake default
        </Badge>
    );

    const renderDatabaseOption = ({ option }: { option: ComboboxItem }) => {
        const meta = databaseMeta.get(option.value);
        return twoLineOption(
            option.label,
            meta?.comment ?? null,
            option.value === defaultDatabase ? defaultBadge : null,
        );
    };

    const renderWarehouseOption = ({ option }: { option: ComboboxItem }) => {
        const meta = warehouseMeta.get(option.value);
        const badge =
            option.value === defaultWarehouse ? (
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

    const handleRetry = () =>
        void runValidation(validationKey(selections), {
            database,
            warehouse,
            role,
            schema: null,
        });

    const handleContinue = () => {
        submittedRef.current = true;
        onSubmit({ database, warehouse, role, schema });
    };

    const showAdminWarning = isAdminRole(role);
    const totals = schemas ? schemaTotals(schemas) : null;
    const checklistResult =
        isValidating || !validation ? null : validation.diagnostic;

    return (
        <Stack gap="sm">
            <Callout variant="info" title="Almost there">
                We connected, but need a few choices to finish configuring your
                connection.
            </Callout>

            <Select
                label="Database"
                description="Where your data lives. You can add more later."
                searchable
                nothingFoundMessage="No databases match"
                data={databaseData}
                renderOption={renderDatabaseOption}
                value={database}
                onChange={handleDatabaseChange}
            />
            <Select
                label="Warehouse"
                description="The compute Snowflake uses to run queries. A small one is fine for BI."
                searchable
                nothingFoundMessage="No warehouses match"
                data={warehouseData}
                renderOption={renderWarehouseOption}
                value={warehouse}
                onChange={(value) => setField('warehouse', value)}
            />
            <Select
                label="Role"
                description="Controls what Lightdash can see. A read-only role is best."
                searchable
                nothingFoundMessage="No roles match"
                data={roleData}
                renderOption={renderRoleOption}
                value={role}
                onChange={(value) => setField('role', value)}
            />

            {showAdminWarning && (
                <Callout
                    variant="warning"
                    title="This role has far more access than Lightdash needs. Consider a dedicated read-only role."
                >
                    <LeastPrivilegeGuidance
                        initialDatabase={database ?? undefined}
                        initialWarehouse={warehouse ?? undefined}
                    />
                </Callout>
            )}

            {schemaData.length > 0 && (
                <Select
                    label="Schema"
                    description="We'll start with this schema — you can add more later."
                    searchable
                    nothingFoundMessage="No schemas match"
                    data={schemaData}
                    value={schema}
                    onChange={(value) => setField('schema', value)}
                />
            )}

            {(isValidating || validation) && (
                <ConnectionTestChecklist
                    result={checklistResult}
                    isLoading={isValidating}
                    expectedChecks={VALIDATION_CHECKS}
                />
            )}

            {!isValidating &&
                validation?.diagnostic.status === 'passed' &&
                totals && (
                    <Text size="sm" c="dimmed">
                        We can see {totals.schemaCount}{' '}
                        {totals.schemaCount === 1 ? 'schema' : 'schemas'} ·{' '}
                        {totals.tableCount}{' '}
                        {totals.tableCount === 1 ? 'table' : 'tables'}.
                    </Text>
                )}

            {!isValidating && credentialExpired && (
                <Callout
                    variant="danger"
                    title={
                        authFailedCheck?.diagnosis?.title ??
                        'Your Snowflake connection has expired'
                    }
                >
                    <Stack gap="sm">
                        {authFailedCheck?.diagnosis?.detail && (
                            <Text size="sm">
                                {authFailedCheck.diagnosis.detail}
                            </Text>
                        )}
                        <Group gap="xs">
                            <Button
                                leftSection={<MantineIcon icon={IconRefresh} />}
                                onClick={onReconnect}
                            >
                                Reconnect with a new code
                            </Button>
                            <Button variant="subtle" onClick={handleRetry}>
                                Retry check
                            </Button>
                        </Group>
                    </Stack>
                </Callout>
            )}

            {!isValidating &&
                !credentialExpired &&
                validation?.diagnostic.status === 'failed' && (
                    <ConnectionTestDiagnosis
                        result={validation.diagnostic}
                        isRetrying={isValidating}
                        onRetry={handleRetry}
                    />
                )}

            {!isValidating && validationErrored && (
                <Alert
                    color="red"
                    icon={<MantineIcon icon={IconAlertTriangle} />}
                    title="We couldn't check the connection"
                >
                    <Stack gap="sm">
                        <Text size="sm">
                            Something went wrong while validating. You can still
                            continue — we'll run the checks again when you
                            finish.
                        </Text>
                        <Button
                            variant="light"
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            onClick={handleRetry}
                        >
                            Retry check
                        </Button>
                    </Stack>
                </Alert>
            )}

            <Group justify="space-between" wrap="nowrap">
                <Button
                    variant="subtle"
                    size="compact-sm"
                    color="gray"
                    onClick={onReconnect}
                >
                    Connect again with a new code
                </Button>
                <Button
                    loading={isSubmitting}
                    disabled={!database || !warehouse || isValidating}
                    onClick={handleContinue}
                >
                    Continue
                </Button>
            </Group>
        </Stack>
    );
};

export default ConfigurePhase;

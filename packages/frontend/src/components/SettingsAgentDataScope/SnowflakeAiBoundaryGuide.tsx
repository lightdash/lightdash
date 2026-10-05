import {
    getAgenticEnvBlock,
    getAgenticIntegrationSql,
    getAgentMaskingSql,
    getSessionCeilingSql,
    UserWarehouseCredentialPurpose,
    type ApiError,
    type SnowflakeAiBoundaryCheck,
    type SnowflakeAiBoundaryGuideConfig,
    type SnowflakeAiBoundaryTestBody,
} from '@lightdash/common';
import {
    Button,
    Checkbox,
    Code,
    CopyButton,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Stepper,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { lightdashApi } from '../../api';
import { useTables } from '../../features/sqlRunner/hooks/useTables';
import useHealth from '../../hooks/health/useHealth';
import {
    useAiAccessRestrictions,
    useProjectUpdateAiAccessRestrictions,
} from '../../hooks/useProject';
import { useUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { useSnowflakeAiLoginPopup } from '../../hooks/useSnowflake';
import InlineErrorState from '../common/InlineErrorState';
import { getSnowflakeAiBoundaryStepStatuses } from './snowflakeAiBoundaryStatus';

const SqlPanel = ({ sql }: { sql: string }) => (
    <Stack gap="xs">
        <ScrollArea h={240}>
            <Code block>{sql}</Code>
        </ScrollArea>
        <CopyButton value={sql}>
            {({ copied, copy }) => (
                <Button size="xs" variant="default" onClick={copy}>
                    {copied ? 'Copied' : 'Copy SQL'}
                </Button>
            )}
        </CopyButton>
    </Stack>
);

const Prerequisites = ({
    isSnowflake,
    enterpriseConfirmed,
    roleConfirmed,
    setEnterpriseConfirmed,
    setRoleConfirmed,
}: {
    isSnowflake: boolean;
    enterpriseConfirmed: boolean;
    roleConfirmed: boolean;
    setEnterpriseConfirmed: (value: boolean) => void;
    setRoleConfirmed: (value: boolean) => void;
}) =>
    isSnowflake ? (
        <Stack gap="xs">
            <Text fz="sm">Confirm these prerequisites in Snowflake:</Text>
            <Checkbox
                label="Snowflake Enterprise edition for masking policies"
                checked={enterpriseConfirmed}
                onChange={(event) =>
                    setEnterpriseConfirmed(event.currentTarget.checked)
                }
            />
            <Checkbox
                label="I have a role that can create integrations, policies and tags"
                checked={roleConfirmed}
                onChange={(event) =>
                    setRoleConfirmed(event.currentTarget.checked)
                }
            />
        </Stack>
    ) : (
        <Text>This project does not use Snowflake.</Text>
    );

const IntegrationEnvironment = ({
    cloud,
    account,
    setAccount,
    envBlock,
}: {
    cloud: boolean;
    account: string;
    setAccount: (value: string) => void;
    envBlock: string;
}) =>
    cloud ? (
        <Text fz="sm">Send the client id and secret to Lightdash support.</Text>
    ) : (
        <>
            <TextInput
                label="Snowflake account"
                value={account}
                onChange={(event) => setAccount(event.currentTarget.value)}
            />
            {envBlock && <SqlPanel sql={envBlock} />}
        </>
    );

const TestResults = ({
    checks,
    error,
    onFix,
}: {
    checks: SnowflakeAiBoundaryCheck[] | null;
    error: string;
    onFix: (step: number) => void;
}) => (
    <>
        {error && (
            <Text c="red" fz="sm">
                {error}
            </Text>
        )}
        {checks?.map((check) => (
            <Group key={check.id} gap="xs">
                <Text fz="sm">
                    {check.id}: {check.status}. {check.detail}
                </Text>
                {check.status === 'fail' && (
                    <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => onFix(check.fixStep - 1)}
                    >
                        Go to step {check.fixStep}
                    </Button>
                )}
            </Group>
        ))}
    </>
);

type ProtectedColumnInputs = NonNullable<
    SnowflakeAiBoundaryTestBody['protectedColumn']
>;

const MaskingStep = ({
    schemas,
    selectedSchemas,
    setSelectedSchemas,
    selectedSchemaSet,
    schemaFilter,
    setSchemaFilter,
    tagDatabase,
    setTagDatabase,
    tagSchema,
    setTagSchema,
    maskingSql,
    confirmed,
    setConfirmed,
}: {
    schemas: { database: string; schema: string; key: string; label: string }[];
    selectedSchemas: string[];
    setSelectedSchemas: (value: string[]) => void;
    selectedSchemaSet: Set<string>;
    schemaFilter: string;
    setSchemaFilter: (value: string) => void;
    tagDatabase: string;
    setTagDatabase: (value: string) => void;
    tagSchema: string;
    setTagSchema: (value: string) => void;
    maskingSql: string;
    confirmed: boolean;
    setConfirmed: (value: boolean) => void;
}) => (
    <Stack gap="sm">
        <TextInput
            label="Find schemas"
            value={schemaFilter}
            onChange={(event) => setSchemaFilter(event.currentTarget.value)}
        />
        <Stack gap="xs">
            {schemas
                .filter((item) =>
                    item.label
                        .toLowerCase()
                        .includes(schemaFilter.toLowerCase()),
                )
                .map((item) => (
                    <Checkbox
                        key={item.key}
                        label={item.label}
                        checked={selectedSchemaSet.has(item.key)}
                        onChange={(event) =>
                            setSelectedSchemas(
                                event.currentTarget.checked
                                    ? [...selectedSchemas, item.key]
                                    : selectedSchemas.filter(
                                          (key) => key !== item.key,
                                      ),
                            )
                        }
                    />
                ))}
        </Stack>
        <TextInput
            label="Tag database"
            value={tagDatabase}
            onChange={(event) => setTagDatabase(event.currentTarget.value)}
        />
        <TextInput
            label="Tag schema"
            value={tagSchema}
            onChange={(event) => setTagSchema(event.currentTarget.value)}
        />
        {maskingSql && <SqlPanel sql={maskingSql} />}
        <Checkbox
            label="I ran this SQL"
            checked={confirmed}
            disabled={selectedSchemas.length === 0 || !maskingSql}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
    </Stack>
);

const BoundaryTestStep = ({
    protectedColumn,
    setProtectedColumn,
    loading,
    onTest,
    checks,
    error,
    onFix,
}: {
    protectedColumn: ProtectedColumnInputs;
    setProtectedColumn: (value: ProtectedColumnInputs) => void;
    loading: boolean;
    onTest: (body: SnowflakeAiBoundaryTestBody) => void;
    checks: SnowflakeAiBoundaryCheck[] | null;
    error: string;
    onFix: (step: number) => void;
}) => (
    <Stack gap="sm">
        <Text fz="sm">
            Optional: enter a protected column to verify masking.
        </Text>
        {(['database', 'schema', 'table', 'column'] as const).map((field) => (
            <TextInput
                key={field}
                label={field}
                value={protectedColumn[field]}
                onChange={(event) =>
                    setProtectedColumn({
                        ...protectedColumn,
                        [field]: event.currentTarget.value,
                    })
                }
            />
        ))}
        <Button
            size="xs"
            loading={loading}
            onClick={() =>
                onTest({
                    protectedColumn: Object.values(protectedColumn).every(
                        Boolean,
                    )
                        ? protectedColumn
                        : null,
                })
            }
        >
            Test boundary
        </Button>
        <TestResults checks={checks} error={error} onFix={onFix} />
    </Stack>
);

const RestrictionsStep = ({
    signedInMemberCount,
    memberCount,
    enabled,
    disabled,
    onChange,
}: {
    signedInMemberCount: number;
    memberCount: number;
    enabled: boolean;
    disabled: boolean;
    onChange: (enabled: boolean) => Promise<void>;
}) => (
    <Stack gap="sm">
        <Text fz="sm">
            {signedInMemberCount} of {memberCount} project members have signed
            in for AI.
        </Text>
        <Switch
            label="AI access restrictions"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => void onChange(event.currentTarget.checked)}
        />
    </Stack>
);

const SessionCeilingStep = ({
    sql,
    confirmed,
    setConfirmed,
}: {
    sql: string;
    confirmed: boolean;
    setConfirmed: (value: boolean) => void;
}) => (
    <Stack gap="sm">
        {sql && <SqlPanel sql={sql} />}
        <Text fz="sm">
            A session policy set on a user replaces the account-level one. Check
            SHOW SESSION POLICIES and users with their own policy.
        </Text>
        <Checkbox
            label="I ran this SQL"
            checked={confirmed}
            disabled={!sql}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
    </Stack>
);

const SignInStep = ({
    signedIn,
    loading,
    onSignIn,
}: {
    signedIn: boolean;
    loading: boolean;
    onSignIn: () => void;
}) => (
    <Group>
        <Text fz="sm">{signedIn ? 'Signed in' : 'Not signed in'}</Text>
        <Button size="xs" onClick={onSignIn} loading={loading}>
            Sign in to Snowflake for AI
        </Button>
    </Group>
);

const IntegrationStep = ({
    integrationName,
    setIntegrationName,
    roles,
    setRoles,
    sql,
    cloud,
    account,
    setAccount,
    envBlock,
    enabled,
}: {
    integrationName: string;
    setIntegrationName: (value: string) => void;
    roles: string;
    setRoles: (value: string) => void;
    sql: string;
    cloud: boolean;
    account: string;
    setAccount: (value: string) => void;
    envBlock: string;
    enabled: boolean;
}) => (
    <Stack gap="sm">
        <TextInput
            label="Integration name"
            value={integrationName}
            onChange={(event) => setIntegrationName(event.currentTarget.value)}
        />
        <TextInput
            label="Pre-authorized roles"
            description="Separate role names with commas"
            value={roles}
            onChange={(event) => setRoles(event.currentTarget.value)}
        />
        {sql ? (
            <SqlPanel sql={sql} />
        ) : (
            <Text c="dimmed" fz="sm">
                Enter a valid integration name and at least one role.
            </Text>
        )}
        <IntegrationEnvironment
            cloud={cloud}
            account={account}
            setAccount={setAccount}
            envBlock={envBlock}
        />
        <Text fz="sm">
            {enabled
                ? 'AI sign-in is configured.'
                : 'Configure the credentials and restart the server to complete this step.'}
        </Text>
    </Stack>
);

export const SnowflakeAiBoundaryGuide = ({
    projectUuid,
    isSnowflake,
    showAiAccessRestrictions,
}: {
    projectUuid: string;
    isSnowflake: boolean;
    showAiAccessRestrictions: boolean;
}) => {
    const [active, setActive] = useState(0);
    const [enterpriseConfirmed, setEnterpriseConfirmed] = useState(false);
    const [roleConfirmed, setRoleConfirmed] = useState(false);
    const [integrationName, setIntegrationName] = useState('LIGHTDASH_AI');
    const [roles, setRoles] = useState('ANALYST');
    const [account, setAccount] = useState('');
    const [tagDatabase, setTagDatabase] = useState('');
    const [tagSchema, setTagSchema] = useState('');
    const [schemaFilter, setSchemaFilter] = useState('_CLEAR');
    const [selectedSchemas, setSelectedSchemas] = useState<string[]>([]);
    const [confirmedMaskingSql, setConfirmedMaskingSql] = useState('');
    const [confirmedCeilingSql, setConfirmedCeilingSql] = useState('');
    const [protectedColumn, setProtectedColumn] = useState({
        database: '',
        schema: '',
        table: '',
        column: '',
    });
    const [checks, setChecks] = useState<SnowflakeAiBoundaryCheck[] | null>(
        null,
    );
    const [testError, setTestError] = useState('');
    const { data: health } = useHealth();
    const { data: credentials } = useUserWarehouseCredentials();
    const { data: catalog } = useTables({ projectUuid });
    const { data: restrictions } = useAiAccessRestrictions(
        projectUuid,
        showAiAccessRestrictions,
    );
    const updateRestrictions =
        useProjectUpdateAiAccessRestrictions(projectUuid);
    const login = useSnowflakeAiLoginPopup();
    const config = useQuery<SnowflakeAiBoundaryGuideConfig, ApiError>(
        ['snowflake-ai-boundary-guide', projectUuid],
        () =>
            lightdashApi<SnowflakeAiBoundaryGuideConfig>({
                url: `/projects/${projectUuid}/ai-boundary/guide`,
                method: 'GET',
                body: undefined,
            }),
        { enabled: isSnowflake },
    );
    const test = useMutation<
        SnowflakeAiBoundaryCheck[],
        ApiError,
        SnowflakeAiBoundaryTestBody
    >({
        mutationFn: (body) =>
            lightdashApi<SnowflakeAiBoundaryCheck[]>({
                url: `/projects/${projectUuid}/ai-boundary/test`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: (result) => {
            setChecks(result);
            setTestError('');
        },
        onError: (error) => setTestError(error.error.message),
    });
    const signedIn =
        credentials?.some(
            (credential) =>
                credential.purpose === UserWarehouseCredentialPurpose.AI &&
                credential.credentials.type === 'snowflake',
        ) ?? false;
    const schemas = useMemo(
        () =>
            Object.entries(catalog ?? {}).flatMap(([database, items]) =>
                Object.keys(items).map((schema) => ({
                    database,
                    schema,
                    key: JSON.stringify([database, schema]),
                    label: `${database}.${schema}`,
                })),
            ),
        [catalog],
    );
    const selectedSchemaSet = useMemo(
        () => new Set(selectedSchemas),
        [selectedSchemas],
    );
    const protectedSchemas = useMemo(
        () => schemas.filter((item) => selectedSchemaSet.has(item.key)),
        [schemas, selectedSchemaSet],
    );
    const integrationSql = useMemo(() => {
        try {
            return getAgenticIntegrationSql({
                integrationName,
                redirectUri: config.data?.redirectUri ?? '',
                preAuthorizedRoles: roles
                    .split(',')
                    .map((role) => role.trim())
                    .filter(Boolean),
            });
        } catch {
            return '';
        }
    }, [integrationName, config.data?.redirectUri, roles]);
    const envBlock = useMemo(() => {
        try {
            return getAgenticEnvBlock({ account });
        } catch {
            return '';
        }
    }, [account]);
    const maskingSql = useMemo(() => {
        try {
            return getAgentMaskingSql({
                tagDatabase,
                tagSchema,
                protectedSchemas,
            });
        } catch {
            return '';
        }
    }, [tagDatabase, tagSchema, protectedSchemas]);
    const ceilingSql = useMemo(() => {
        try {
            return getSessionCeilingSql({
                database: tagDatabase,
                schema: tagSchema,
                blockedRoles: [],
            });
        } catch {
            return '';
        }
    }, [tagDatabase, tagSchema]);
    const maskingConfirmed =
        maskingSql !== '' &&
        protectedSchemas.length > 0 &&
        confirmedMaskingSql === maskingSql;
    const ceilingConfirmed =
        ceilingSql !== '' && confirmedCeilingSql === ceilingSql;
    const statuses = getSnowflakeAiBoundaryStepStatuses({
        isSnowflake,
        enterpriseConfirmed,
        roleConfirmed,
        aiSignInEnabled: health?.auth.snowflakeAi.enabled === true,
        maskingConfirmed,
        ceilingConfirmed,
        signedIn,
        checks,
        restrictionsEnabled: restrictions?.enabled ?? false,
    });
    const stepLabel = (label: string, index: number) =>
        `${label} · ${statuses[index]}`;

    return (
        <Paper p="md">
            <Stack gap="lg">
                <Title order={5}>Snowflake AI boundary guide</Title>
                {config.isError && (
                    <InlineErrorState
                        message="Could not load the guide configuration."
                        onRetry={() => void config.refetch()}
                    />
                )}
                <Stepper
                    active={active}
                    onStepClick={(step) => {
                        setActive(step);
                        if (step === 6) void config.refetch();
                    }}
                    orientation="vertical"
                    allowNextStepsSelect
                >
                    <Stepper.Step label={stepLabel('Before you start', 0)}>
                        <Prerequisites
                            isSnowflake={isSnowflake}
                            enterpriseConfirmed={enterpriseConfirmed}
                            roleConfirmed={roleConfirmed}
                            setEnterpriseConfirmed={setEnterpriseConfirmed}
                            setRoleConfirmed={setRoleConfirmed}
                        />
                    </Stepper.Step>
                    {isSnowflake && (
                        <>
                            <Stepper.Step
                                label={stepLabel('Create the AI sign-in', 1)}
                            >
                                <IntegrationStep
                                    integrationName={integrationName}
                                    setIntegrationName={setIntegrationName}
                                    roles={roles}
                                    setRoles={setRoles}
                                    sql={integrationSql}
                                    cloud={config.data?.cloud ?? false}
                                    account={account}
                                    setAccount={setAccount}
                                    envBlock={envBlock}
                                    enabled={
                                        health?.auth.snowflakeAi.enabled ===
                                        true
                                    }
                                />
                            </Stepper.Step>
                            <Stepper.Step
                                label={stepLabel('Hide PII from agents', 2)}
                            >
                                <MaskingStep
                                    schemas={schemas}
                                    selectedSchemas={selectedSchemas}
                                    setSelectedSchemas={setSelectedSchemas}
                                    selectedSchemaSet={selectedSchemaSet}
                                    schemaFilter={schemaFilter}
                                    setSchemaFilter={setSchemaFilter}
                                    tagDatabase={tagDatabase}
                                    setTagDatabase={setTagDatabase}
                                    tagSchema={tagSchema}
                                    setTagSchema={setTagSchema}
                                    maskingSql={maskingSql}
                                    confirmed={maskingConfirmed}
                                    setConfirmed={(value) =>
                                        setConfirmedMaskingSql(
                                            value ? maskingSql : '',
                                        )
                                    }
                                />
                            </Stepper.Step>
                            <Stepper.Step
                                label={stepLabel('Session ceiling', 3)}
                            >
                                <SessionCeilingStep
                                    sql={ceilingSql}
                                    confirmed={ceilingConfirmed}
                                    setConfirmed={(value) =>
                                        setConfirmedCeilingSql(
                                            value ? ceilingSql : '',
                                        )
                                    }
                                />
                            </Stepper.Step>
                            <Stepper.Step
                                label={stepLabel('Sign in for AI yourself', 4)}
                            >
                                <SignInStep
                                    signedIn={signedIn}
                                    loading={login.isLoading}
                                    onSignIn={() =>
                                        login.mutate(undefined, {
                                            onSuccess: () =>
                                                void config.refetch(),
                                        })
                                    }
                                />
                            </Stepper.Step>
                            <Stepper.Step
                                label={stepLabel('Test the boundary', 5)}
                            >
                                <BoundaryTestStep
                                    protectedColumn={protectedColumn}
                                    setProtectedColumn={setProtectedColumn}
                                    loading={test.isLoading}
                                    onTest={test.mutate}
                                    checks={checks}
                                    error={testError}
                                    onFix={setActive}
                                />
                            </Stepper.Step>
                            <Stepper.Step
                                label={stepLabel(
                                    'Turn on AI access restrictions',
                                    6,
                                )}
                            >
                                <RestrictionsStep
                                    signedInMemberCount={
                                        config.data?.signedInMemberCount ?? 0
                                    }
                                    memberCount={config.data?.memberCount ?? 0}
                                    enabled={restrictions?.enabled ?? false}
                                    disabled={
                                        !showAiAccessRestrictions ||
                                        !restrictions ||
                                        updateRestrictions.isLoading
                                    }
                                    onChange={updateRestrictions.mutateAsync}
                                />
                            </Stepper.Step>
                        </>
                    )}
                </Stepper>
            </Stack>
        </Paper>
    );
};

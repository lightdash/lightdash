import {
    OnboardingStepStatus,
    OnboardingStepType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type OnboardingConnectionInventory,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useFormContext } from '../../../../components/ProjectConnection/formContext';
import { SnowflakeDefaultValues } from '../../../../components/ProjectConnection/WarehouseForms/defaultValues';
import { useOnboardingWizard } from '../../context/wizardContext';
import { useConnectCode } from '../../hooks/useConnectCode';
import { useCreateOnboardingProject } from '../../hooks/useCreateOnboardingProject';
import { findStep, useOnboardingState } from '../../hooks/useOnboardingState';
import CopyScriptBlock from './CopyScriptBlock';
import MethodScreenLayout from './MethodScreenLayout';

type Phase = 'form' | 'waiting' | 'configure';

const CONNECT_STEP_RESULT_INVENTORY = (
    result: Record<string, unknown> | null,
): OnboardingConnectionInventory | null => {
    if (!result || typeof result !== 'object') return null;
    const inventory = (result as { inventory?: unknown }).inventory;
    if (!inventory || typeof inventory !== 'object') return null;
    return inventory as OnboardingConnectionInventory;
};

const ConnectMethodCliSso: FC = () => {
    const form = useFormContext();
    const wizard = useOnboardingWizard();
    const createProject = useCreateOnboardingProject();
    const connectCode = useConnectCode();

    const [phase, setPhase] = useState<Phase>('form');
    const [projectUuid, setProjectUuid] = useState<string | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState<number | null>(
        null,
    );
    const [configValues, setConfigValues] = useState<{
        database: string | null;
        warehouse: string | null;
        role: string | null;
    }>({ database: null, warehouse: null, role: null });

    const account =
        form.values.warehouse?.type === WarehouseTypes.SNOWFLAKE
            ? (form.values.warehouse.account ?? '')
            : '';
    const userName =
        form.values.warehouse?.type === WarehouseTypes.SNOWFLAKE
            ? (form.values.warehouse.user ?? '')
            : '';

    const stateQuery = useOnboardingState({
        projectUuid: projectUuid ?? undefined,
        poll: phase === 'waiting',
    });

    const connectStep = findStep(stateQuery.data, OnboardingStepType.CONNECT);

    useEffect(() => {
        if (phase !== 'waiting' || !connectStep) return;
        if (connectStep.status === OnboardingStepStatus.COMPLETED) {
            wizard.goToProjectStep(projectUuid!, OnboardingStepType.PROFILE);
        } else if (
            connectStep.status === OnboardingStepStatus.PENDING_CONFIGURATION
        ) {
            setPhase('configure');
        }
    }, [phase, connectStep, projectUuid, wizard]);

    useEffect(() => {
        if (secondsRemaining === null) return undefined;
        const interval = setInterval(() => {
            setSecondsRemaining((prev) =>
                prev === null ? null : Math.max(0, prev - 1),
            );
        }, 1000);
        return () => clearInterval(interval);
    }, [secondsRemaining]);

    const mintCode = async (existingProjectUuid: string) => {
        const code = await connectCode.mutateAsync(existingProjectUuid);
        setSecondsRemaining(
            Math.max(
                0,
                Math.round(
                    (new Date(code.expiresAt).getTime() - Date.now()) / 1000,
                ),
            ),
        );
        return code.code;
    };

    const [code, setCode] = useState<string | null>(null);

    const handleGenerate = async () => {
        const placeholder: CreateSnowflakeCredentials = {
            ...SnowflakeDefaultValues,
            account,
            user: userName,
            authenticationType: SnowflakeAuthenticationType.NONE,
            requireUserCredentials: true,
        };
        const { projectUuid: newProjectUuid } = await createProject.mutateAsync(
            {
                name: 'My project',
                warehouseConnection: placeholder,
            },
        );
        setProjectUuid(newProjectUuid);
        const newCode = await mintCode(newProjectUuid);
        setCode(newCode);
        setPhase('waiting');
    };

    const handleRegenerate = async () => {
        if (!projectUuid) return;
        const newCode = await mintCode(projectUuid);
        setCode(newCode);
    };

    const installCommand = 'npx @lightdash/cli@latest';
    const connectCommand = code
        ? `lightdash connect-snowflake --url ${wizard.siteUrl} --code ${code} --account ${account} --user ${userName}`
        : '';

    const inventory = CONNECT_STEP_RESULT_INVENTORY(
        connectStep?.result ?? null,
    );

    return (
        <MethodScreenLayout title="Sign in with Snowflake SSO">
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    We'll give you two commands to run in your terminal. Our CLI
                    signs you into Snowflake in your browser and creates a
                    durable, read-only credential — no admin required.
                </Text>

                {phase === 'form' && (
                    <>
                        <TextInput
                            label="Account"
                            required
                            {...form.getInputProps('warehouse.account')}
                        />
                        <TextInput
                            label="Snowflake username"
                            required
                            {...form.getInputProps('warehouse.user')}
                        />
                        <Button
                            style={{ alignSelf: 'flex-end' }}
                            loading={
                                createProject.isLoading || connectCode.isLoading
                            }
                            disabled={!account || !userName}
                            onClick={() => void handleGenerate()}
                        >
                            Generate connect code
                        </Button>
                    </>
                )}

                {(phase === 'waiting' || phase === 'configure') && code && (
                    <Stack gap="md">
                        <Stack gap="xs">
                            <Text size="sm" fw={500}>
                                1. Install the CLI
                            </Text>
                            <CopyScriptBlock script={installCommand} />
                        </Stack>
                        <Stack gap="xs">
                            <Text size="sm" fw={500}>
                                2. Connect with SSO
                            </Text>
                            <CopyScriptBlock script={connectCommand} />
                        </Stack>

                        {secondsRemaining !== null && (
                            <Group gap="xs">
                                <Text size="xs" c="dimmed">
                                    {secondsRemaining > 0
                                        ? `Code expires in ${secondsRemaining}s`
                                        : 'Code expired'}
                                </Text>
                                <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    loading={connectCode.isLoading}
                                    onClick={() => void handleRegenerate()}
                                >
                                    Generate new code
                                </Button>
                            </Group>
                        )}
                    </Stack>
                )}

                {phase === 'waiting' &&
                    connectStep?.status !== OnboardingStepStatus.ERROR && (
                        <Group gap="xs">
                            <Loader size="xs" />
                            <Text size="sm" c="dimmed">
                                Waiting for the CLI to finish signing in…
                            </Text>
                        </Group>
                    )}

                {connectStep?.status === OnboardingStepStatus.ERROR && (
                    <Alert
                        color="red"
                        icon={<MantineIcon icon={IconAlertTriangle} />}
                        title="Connection failed"
                    >
                        The CLI reported a problem connecting. Generate a new
                        code and try again.
                    </Alert>
                )}

                {phase === 'configure' && (
                    <Stack gap="sm">
                        <Callout variant="info" title="Almost there">
                            We connected, but need a few choices to finish
                            configuring your connection.
                        </Callout>
                        <Select
                            label="Database"
                            data={inventory?.databases ?? []}
                            value={configValues.database}
                            onChange={(value) =>
                                setConfigValues((prev) => ({
                                    ...prev,
                                    database: value,
                                }))
                            }
                        />
                        <Select
                            label="Warehouse"
                            data={inventory?.warehouses ?? []}
                            value={configValues.warehouse}
                            onChange={(value) =>
                                setConfigValues((prev) => ({
                                    ...prev,
                                    warehouse: value,
                                }))
                            }
                        />
                        <Select
                            label="Role"
                            data={inventory?.roles ?? []}
                            value={configValues.role}
                            onChange={(value) =>
                                setConfigValues((prev) => ({
                                    ...prev,
                                    role: value,
                                }))
                            }
                        />
                        {/* TODO(5b): submit selected configuration values —
                            the deposit-configuration endpoint ships in phase 5b. */}
                        <Button disabled style={{ alignSelf: 'flex-end' }}>
                            Continue
                        </Button>
                    </Stack>
                )}
            </Stack>
        </MethodScreenLayout>
    );
};

export default ConnectMethodCliSso;

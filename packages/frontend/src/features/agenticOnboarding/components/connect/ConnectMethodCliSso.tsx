import {
    LightdashMode,
    OnboardingStepStatus,
    OnboardingStepType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type OnboardingConnectionValues,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useFormContext } from '../../../../components/ProjectConnection/formContext';
import { SnowflakeDefaultValues } from '../../../../components/ProjectConnection/WarehouseForms/defaultValues';
import { useProject } from '../../../../hooks/useProject';
import useApp from '../../../../providers/App/useApp';
import { useOnboardingWizard } from '../../context/wizardContext';
import { useConfigureConnection } from '../../hooks/useConfigureConnection';
import { useConnectCode } from '../../hooks/useConnectCode';
import { useCreateOnboardingProject } from '../../hooks/useCreateOnboardingProject';
import { findStep, useOnboardingState } from '../../hooks/useOnboardingState';
import { parseConnectStepResult } from '../../utils/configureHelpers';
import ConfigurePhase from './ConfigurePhase';
import CopyScriptBlock from './CopyScriptBlock';
import MethodScreenLayout from './MethodScreenLayout';

type Phase = 'form' | 'waiting' | 'configure';

type ConnectHandoff = { justCreated?: boolean };

const ConnectMethodCliSso: FC = () => {
    const form = useFormContext();
    const wizard = useOnboardingWizard();
    const location = useLocation();
    const navigate = useNavigate();
    const createProject = useCreateOnboardingProject();
    const connectCode = useConnectCode();

    // When present in the URL we're resuming an already-created project (either
    // via the post-creation navigation or a page refresh).
    const projectUuid = wizard.projectUuid;
    const handoff = (location.state as ConnectHandoff | null) ?? null;

    const [phase, setPhase] = useState<Phase>('form');
    const configureConnection = useConfigureConnection(projectUuid);
    const [secondsRemaining, setSecondsRemaining] = useState<number | null>(
        null,
    );
    // The connect-step timestamp captured when we (re-)enter the CLI wait, so the
    // resume effect only advances once a genuinely NEW deposit lands — otherwise
    // a stale pending_configuration would snap us straight back out of a
    // reconnect wait.
    const waitMarkerRef = useRef<number | null>(null);

    const formAccount =
        form.values.warehouse?.type === WarehouseTypes.SNOWFLAKE
            ? (form.values.warehouse.account ?? '')
            : '';
    // The form resets across the post-creation remount and page refreshes, so
    // the account also lives in the URL once the project exists.
    const accountParam = new URLSearchParams(location.search).get('account');

    // Third fallback for projects created before the account-in-query change:
    // the account stored in the project's (non-sensitive) warehouse connection.
    const projectQuery = useProject(projectUuid ?? undefined);
    const projectAccount =
        projectQuery.data?.warehouseConnection?.type ===
        WarehouseTypes.SNOWFLAKE
            ? (projectQuery.data.warehouseConnection.account ?? '')
            : '';

    const account = formAccount || (accountParam ?? '') || projectAccount;

    const prefilledAccountRef = useRef(false);
    useEffect(() => {
        // Seed the form once from whichever fallback wins (query or the stored
        // project account, which may arrive asynchronously).
        if (prefilledAccountRef.current) return;
        if (form.values.warehouse?.type !== WarehouseTypes.SNOWFLAKE) return;
        if (formAccount) return;
        const fallback = accountParam || projectAccount;
        if (!fallback) return;
        prefilledAccountRef.current = true;
        form.setFieldValue('warehouse.account', fallback);
    }, [accountParam, projectAccount, formAccount, form]);

    const stateQuery = useOnboardingState({
        projectUuid: projectUuid ?? undefined,
        poll: phase === 'waiting',
    });

    const connectStep = findStep(stateQuery.data, OnboardingStepType.CONNECT);

    useEffect(() => {
        // Resume from server state: runs from 'form' (refresh/handoff) as well as
        // 'waiting' (happy path), so a reload lands on the right phase.
        if (phase === 'configure' || !connectStep || !projectUuid) return;
        // While waiting, ignore the pre-existing deposit — only react once the
        // CLI has produced a fresher one (updatedAt beyond the wait marker).
        const stepTime = new Date(connectStep.updatedAt).getTime();
        if (
            phase === 'waiting' &&
            waitMarkerRef.current !== null &&
            stepTime <= waitMarkerRef.current
        ) {
            return;
        }
        if (connectStep.status === OnboardingStepStatus.COMPLETED) {
            wizard.goToProjectStep(projectUuid, OnboardingStepType.PROFILE);
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

    const [code, setCode] = useState<string | null>(null);
    const autoMintedRef = useRef(false);

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

    const mintForProject = async (uuid: string) => {
        waitMarkerRef.current = connectStep
            ? new Date(connectStep.updatedAt).getTime()
            : 0;
        const newCode = await mintCode(uuid);
        setCode(newCode);
        setPhase('waiting');
    };

    const handleGenerate = async () => {
        if (projectUuid) {
            // Resuming an existing project: reuse it, just mint a fresh code.
            await mintForProject(projectUuid);
            return;
        }
        const placeholder: CreateSnowflakeCredentials = {
            ...SnowflakeDefaultValues,
            account,
            user: '',
            authenticationType: SnowflakeAuthenticationType.NONE,
            requireUserCredentials: true,
        };
        const { projectUuid: newProjectUuid } = await createProject.mutateAsync(
            {
                name: 'My project',
                warehouseConnection: placeholder,
            },
        );
        // Hand off to the project-scoped connect route (remounts here) so a
        // refresh resumes instead of redirecting home.
        wizard.goToProjectConnect(newProjectUuid, account);
    };

    const handleRegenerate = async () => {
        if (!projectUuid) return;
        const newCode = await mintCode(projectUuid);
        setCode(newCode);
    };

    useEffect(() => {
        // Straight after the post-creation navigation, mint the first code once,
        // then scrub the navigation state: location.state survives page reloads,
        // and minting deletes the project's previous unused codes — re-minting on
        // refresh would invalidate a code an in-flight CLI run is holding.
        if (!projectUuid || !handoff?.justCreated) return;
        if (autoMintedRef.current) return;
        autoMintedRef.current = true;
        void mintForProject(projectUuid);
        void navigate(location.pathname + location.search, {
            replace: true,
            state: null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectUuid, handoff]);

    const { health } = useApp();
    // In dev the published CLI doesn't have this command yet; show the
    // worktree invocation instead so the flow is copy-pasteable
    const isDevMode = health.data?.mode === LightdashMode.DEV;
    const installCommand = isDevMode
        ? '# dev instance: run from your lightdash repo root'
        : 'npx @lightdash/cli@latest';
    const cliBinary = isDevMode
        ? 'pnpm -F cli exec tsx src/index.ts connect-snowflake'
        : 'lightdash connect-snowflake';
    const connectCommand = code
        ? `${cliBinary} --url ${wizard.siteUrl} --code ${code} --account ${account}`
        : '';

    const parsedConnectResult = parseConnectStepResult(
        connectStep?.result ?? null,
    );

    const handleSubmitConfiguration = async (
        connectionValues: OnboardingConnectionValues,
    ) => {
        if (!projectUuid) return;
        const depositResult = await configureConnection.mutateAsync({
            connectionValues,
        });
        if (depositResult.stepStatus === OnboardingStepStatus.COMPLETED) {
            wizard.goToProjectStep(projectUuid, OnboardingStepType.PROFILE);
        } else {
            setPhase('waiting');
        }
    };

    return (
        <MethodScreenLayout title="Sign in with Snowflake SSO">
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    We'll give you two commands to run in your terminal. Our CLI
                    signs you into Snowflake in your browser and creates a
                    secure, revocable connection — no admin required.
                </Text>

                {phase === 'form' && (
                    <>
                        <TextInput
                            label="Account"
                            required
                            {...form.getInputProps('warehouse.account')}
                        />
                        <Button
                            style={{ alignSelf: 'flex-end' }}
                            loading={
                                createProject.isLoading || connectCode.isLoading
                            }
                            disabled={!account}
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
                            {account ? (
                                <CopyScriptBlock script={connectCommand} />
                            ) : (
                                <TextInput
                                    label="Snowflake account"
                                    description="We need your account identifier to build the command."
                                    required
                                    {...form.getInputProps('warehouse.account')}
                                />
                            )}
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

                {phase === 'configure' &&
                    projectUuid &&
                    parsedConnectResult && (
                        <ConfigurePhase
                            key={projectUuid}
                            projectUuid={projectUuid}
                            parsed={parsedConnectResult}
                            isSubmitting={configureConnection.isLoading}
                            onSubmit={(values) =>
                                void handleSubmitConfiguration(values)
                            }
                            onReconnect={() => void mintForProject(projectUuid)}
                        />
                    )}
            </Stack>
        </MethodScreenLayout>
    );
};

export default ConnectMethodCliSso;

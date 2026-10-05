import { Paper, Stack, Stepper, Title } from '@mantine/core';
import { IconCheck, IconCircle, IconX } from '@tabler/icons-react';
import InlineErrorState from '../common/InlineErrorState';
import { BoundaryTestStep } from './BoundaryTestStep';
import { IntegrationStep } from './IntegrationStep';
import { MaskingStep } from './MaskingStep';
import { Prerequisites } from './Prerequisites';
import { RestrictionsStep } from './RestrictionsStep';
import { SessionCeilingStep } from './SessionCeilingStep';
import { SignInStep } from './SignInStep';
import {
    getSnowflakeAiBoundaryStepStatuses,
    type GuideStepStatus,
} from './snowflakeAiBoundaryStatus';
import { useBoundaryGuide } from './useBoundaryGuide';

const stepIcon = (status: GuideStepStatus) => {
    if (status === 'done') return <IconCheck size={16} />;
    if (status === 'failed') return <IconX size={16} />;
    return <IconCircle size={16} />;
};

export const LegacySnowflakeAiBoundaryGuide = ({
    projectUuid,
    isSnowflake,
    showAiAccessRestrictions,
}: {
    projectUuid: string;
    isSnowflake: boolean;
    showAiAccessRestrictions: boolean;
}) => {
    const {
        active,
        setActive,
        enterpriseConfirmed,
        setEnterpriseConfirmed,
        roleConfirmed,
        setRoleConfirmed,
        integrationName,
        setIntegrationName,
        roles,
        setRoles,
        setAccount,
        tagDatabase,
        setTagDatabase,
        tagSchema,
        setTagSchema,
        schemaFilter,
        setSchemaFilter,
        selectedSchemas,
        setSelectedSchemas,
        setConfirmedMaskingSql,
        setConfirmedCeilingSql,
        protectedColumn,
        setProtectedColumn,
        checks,
        testError,
        health,
        restrictions,
        updateRestrictions,
        login,
        config,
        account,
        test,
        signedIn,
        schemas,
        selectedSchemaSet,
        integrationSql,
        envBlock,
        maskingSql,
        ceilingSql,
        maskingConfirmed,
        ceilingConfirmed,
    } = useBoundaryGuide({
        projectUuid,
        isSnowflake,
        showAiAccessRestrictions,
    });
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
    const stepProps = (label: string, index: number) => ({
        label: `${label} · ${statuses[index]}`,
        icon: stepIcon(statuses[index]),
        completedIcon: stepIcon(statuses[index]),
    });

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
                    <Stepper.Step {...stepProps('Before you start', 0)}>
                        <Prerequisites
                            isSnowflake={isSnowflake}
                            enterpriseConfirmed={enterpriseConfirmed}
                            roleConfirmed={roleConfirmed}
                            setEnterpriseConfirmed={setEnterpriseConfirmed}
                            setRoleConfirmed={setRoleConfirmed}
                        />
                    </Stepper.Step>
                    {isSnowflake && [
                        <Stepper.Step
                            key="ai-sign-in"
                            {...stepProps('Create the AI sign-in', 1)}
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
                                    health?.auth.snowflakeAi.enabled === true
                                }
                            />
                        </Stepper.Step>,
                        <Stepper.Step
                            key="masking"
                            {...stepProps('Hide PII from agents', 2)}
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
                        </Stepper.Step>,
                        <Stepper.Step
                            key="session-ceiling"
                            {...stepProps('Session ceiling', 3)}
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
                        </Stepper.Step>,
                        <Stepper.Step
                            key="sign-in"
                            {...stepProps('Sign in for AI yourself', 4)}
                        >
                            <SignInStep
                                signedIn={signedIn}
                                loading={login.isLoading}
                                onSignIn={() =>
                                    login.mutate(undefined, {
                                        onSuccess: () => void config.refetch(),
                                    })
                                }
                            />
                        </Stepper.Step>,
                        <Stepper.Step
                            key="test"
                            {...stepProps('Test the boundary', 5)}
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
                        </Stepper.Step>,
                        <Stepper.Step
                            key="restrictions"
                            {...stepProps('Turn on AI access restrictions', 6)}
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
                        </Stepper.Step>,
                    ]}
                </Stepper>
            </Stack>
        </Paper>
    );
};

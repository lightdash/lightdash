import { type AiIdentitiesSummary } from '@lightdash/common';
import { Checkbox, Paper, Stack, Stepper, Text, Title } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useAiIdentities } from '../../hooks/useAiIdentities';
import InlineErrorState from '../common/InlineErrorState';
import { AiTwinCheckStep } from './AiTwinCheckStep';
import { AiTwinCreateStep } from './AiTwinCreateStep';
import { AiTwinMaskingStep } from './AiTwinMaskingStep';
import { AiTwinNamingStep } from './AiTwinNamingStep';
import { AiTwinOptionalSignIn } from './AiTwinOptionalSignIn';
import { AiTwinRestrictionsStep } from './AiTwinRestrictionsStep';
import { aiTwinCheckStatus, aiTwinFixStep } from './aiTwinStatus';
import { BoundaryTestStep } from './BoundaryTestStep';
import { Prerequisites } from './Prerequisites';
import type { BoundaryGuideProps } from './SnowflakeAiBoundaryGuide';
import { useBoundaryGuide } from './useBoundaryGuide';

const AiTwinSteps = ({
    guide,
    summary,
    props,
}: {
    guide: ReturnType<typeof useBoundaryGuide>;
    summary: AiIdentitiesSummary;
    props: BoundaryGuideProps;
}) => {
    const [dataRoleConfirmed, setDataRoleConfirmed] = useLocalStorage({
        key: `snowflake-ai-twins:${props.projectUuid}:data-role`,
        defaultValue: false,
    });
    const [confirmedSql, setConfirmedSql] = useLocalStorage({
        key: `snowflake-ai-twins:${props.projectUuid}:sql`,
        defaultValue: '',
    });
    const steps = [
        {
            key: 'prerequisites',
            label: 'Before you start',
            content: (
                <Stack gap="sm">
                    <Prerequisites
                        isSnowflake={props.isSnowflake}
                        enterpriseConfirmed={guide.enterpriseConfirmed}
                        roleConfirmed={guide.roleConfirmed}
                        setEnterpriseConfirmed={guide.setEnterpriseConfirmed}
                        setRoleConfirmed={guide.setRoleConfirmed}
                    />
                    <Checkbox
                        label="A role per person (or per team) that grants their data minus PII"
                        checked={dataRoleConfirmed}
                        onChange={(event) =>
                            setDataRoleConfirmed(event.currentTarget.checked)
                        }
                    />
                </Stack>
            ),
        },
        {
            key: 'naming',
            label: 'Name the AI users',
            content: (
                <AiTwinNamingStep
                    projectUuid={props.projectUuid}
                    settings={summary.settings}
                />
            ),
        },
        {
            key: 'masking',
            label: 'Hide PII from AI users',
            content: <AiTwinMaskingStep guide={guide} />,
        },
        {
            key: 'create',
            label: 'Create the AI users',
            content: (
                <AiTwinCreateStep
                    projectUuid={props.projectUuid}
                    identities={summary.identities}
                    database={guide.tagDatabase}
                    schema={guide.tagSchema}
                    confirmedSql={confirmedSql}
                    onConfirm={setConfirmedSql}
                />
            ),
        },
        {
            key: 'check',
            label: `Check each AI user · ${aiTwinCheckStatus(summary.identities, summary.membersWithoutIdentity.length)}`,
            content: (
                <AiTwinCheckStep
                    projectUuid={props.projectUuid}
                    summary={summary}
                />
            ),
        },
        {
            key: 'boundary',
            label: 'Test the boundary',
            content: (
                <BoundaryTestStep
                    aiTwins
                    protectedColumn={guide.protectedColumn}
                    setProtectedColumn={guide.setProtectedColumn}
                    loading={guide.test.isLoading}
                    onTest={guide.test.mutate}
                    checks={
                        guide.checks?.map((check) => ({
                            ...check,
                            fixStep: aiTwinFixStep(check.id),
                        })) ?? null
                    }
                    error={guide.testError}
                    onFix={guide.setActive}
                />
            ),
        },
        {
            key: 'restrictions',
            label: 'Turn on AI access restrictions',
            content: (
                <AiTwinRestrictionsStep
                    enabled={guide.restrictions?.enabled ?? false}
                    disabled={
                        !props.showAiAccessRestrictions ||
                        !guide.restrictions ||
                        guide.updateRestrictions.isLoading
                    }
                    onChange={guide.updateRestrictions.mutate}
                />
            ),
        },
    ];
    return (
        <Stack gap="lg">
            <Stepper
                active={guide.active}
                onStepClick={guide.setActive}
                orientation="vertical"
                allowNextStepsSelect
            >
                {steps.map((step) => (
                    <Stepper.Step key={step.key} label={step.label}>
                        {step.content}
                    </Stepper.Step>
                ))}
            </Stepper>
            <AiTwinOptionalSignIn guide={guide} />
        </Stack>
    );
};

export const AiTwinsGuide = (props: BoundaryGuideProps) => {
    const guide = useBoundaryGuide(props);
    const identities = useAiIdentities(props.projectUuid, props.isSnowflake);
    return (
        <Paper p="md">
            <Stack gap="lg">
                <Title order={5}>Snowflake AI boundary guide</Title>
                {!props.isSnowflake && (
                    <Text>This project does not use Snowflake.</Text>
                )}
                {guide.config.isError && (
                    <InlineErrorState
                        message="Could not load the guide configuration."
                        onRetry={() => void guide.config.refetch()}
                    />
                )}
                {identities.isError && (
                    <InlineErrorState
                        message={identities.error.error.message}
                        onRetry={() => void identities.refetch()}
                    />
                )}
                {props.isSnowflake && identities.isLoading && (
                    <Text>Loading AI users…</Text>
                )}
                {identities.data && (
                    <AiTwinSteps
                        guide={guide}
                        summary={identities.data}
                        props={props}
                    />
                )}
            </Stack>
        </Paper>
    );
};

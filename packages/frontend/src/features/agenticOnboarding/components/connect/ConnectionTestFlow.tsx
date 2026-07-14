import {
    OnboardingStepStatus,
    OnboardingStepType,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { Button, Stack, Text } from '@mantine-8/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useFormContext } from '../../../../components/ProjectConnection/formContext';
import useApp from '../../../../providers/App/useApp';
import { useOnboardingWizard } from '../../context/wizardContext';
import { useConnectionTest } from '../../hooks/useConnectionTest';
import { useCreateOnboardingProject } from '../../hooks/useCreateOnboardingProject';
import { patchOnboardingState } from '../../hooks/useOnboardingState';
import ConnectionTestChecklist from './ConnectionTestChecklist';
import ConnectionTestDiagnosis from './ConnectionTestDiagnosis';

type ConnectionTestFlowProps = {
    children: (busy: boolean) => ReactNode;
};

const ConnectionTestFlow: FC<ConnectionTestFlowProps> = ({ children }) => {
    const form = useFormContext();
    const { user } = useApp();
    const wizard = useOnboardingWizard();
    const runTest = useConnectionTest();
    const createProject = useCreateOnboardingProject();
    const [isFinalizing, setIsFinalizing] = useState(false);

    const result = runTest.data ?? null;
    const busy = runTest.isLoading || isFinalizing;

    const handleTest = () => {
        runTest.mutate(form.values.warehouse as CreateWarehouseCredentials);
    };

    const handleContinue = async () => {
        setIsFinalizing(true);
        try {
            const { projectUuid } = await createProject.mutateAsync({
                name: user.data?.organizationName || 'My project',
                warehouseConnection: form.values
                    .warehouse as CreateWarehouseCredentials,
            });
            await patchOnboardingState(projectUuid, {
                step: OnboardingStepType.CONNECT,
                status: OnboardingStepStatus.COMPLETED,
                result: null,
            }).catch(() => undefined);
            wizard.goToProjectStep(projectUuid, OnboardingStepType.PROFILE);
        } finally {
            setIsFinalizing(false);
        }
    };

    return (
        <Stack gap="md">
            {children(busy)}

            {!result && (
                <Button
                    onClick={handleTest}
                    loading={runTest.isLoading}
                    style={{ alignSelf: 'flex-end' }}
                >
                    Test connection
                </Button>
            )}

            {(runTest.isLoading || result) && (
                <ConnectionTestChecklist
                    result={result}
                    isLoading={runTest.isLoading}
                />
            )}

            {result?.status === 'passed' && (
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        All checks passed — your connection is read-only and
                        ready to go.
                    </Text>
                    <Button
                        rightSection={<MantineIcon icon={IconArrowRight} />}
                        loading={isFinalizing}
                        onClick={() => void handleContinue()}
                        style={{ alignSelf: 'flex-end' }}
                    >
                        Continue → profile my data
                    </Button>
                </Stack>
            )}

            {result?.status === 'failed' && (
                <ConnectionTestDiagnosis
                    result={result}
                    isRetrying={runTest.isLoading}
                    onRetry={handleTest}
                />
            )}
        </Stack>
    );
};

export default ConnectionTestFlow;

import {
    Container,
    Paper,
    Stack,
    Stepper,
    Text,
    Title,
} from '@mantine-8/core';
import { type FC, useState } from 'react';
import Page from '../components/common/Page/Page';
import { OnboardingBigQueryStep } from '../components/OnboardingWizard/OnboardingBigQueryStep';
import { OnboardingCreateProjectStep } from '../components/OnboardingWizard/OnboardingCreateProjectStep';
import { OnboardingDashboardStep } from '../components/OnboardingWizard/OnboardingDashboardStep';
import { OnboardingGithubStep } from '../components/OnboardingWizard/OnboardingGithubStep';
import { OnboardingRepoStep } from '../components/OnboardingWizard/OnboardingRepoStep';

type OnboardingState = {
    bigqueryConnected: boolean;
    gcpProjectId: string;
    githubConnected: boolean;
    selectedRepo: {
        owner: string;
        repo: string;
        branch: string;
        isNewRepo: boolean;
    } | null;
    projectUuid: string | null;
};

const OnboardingWizard: FC = () => {
    const [activeStep, setActiveStep] = useState(0);
    const [state, setState] = useState<OnboardingState>({
        bigqueryConnected: false,
        gcpProjectId: '',
        githubConnected: false,
        selectedRepo: null,
        projectUuid: null,
    });

    const handleBigQueryComplete = (gcpProjectId: string) => {
        setState((prev) => ({
            ...prev,
            bigqueryConnected: true,
            gcpProjectId,
        }));
        setActiveStep(1);
    };

    const handleGithubComplete = () => {
        setState((prev) => ({ ...prev, githubConnected: true }));
        setActiveStep(2);
    };

    const handleRepoSelect = (repo: {
        owner: string;
        repo: string;
        branch: string;
        isNewRepo: boolean;
    }) => {
        setState((prev) => ({ ...prev, selectedRepo: repo }));
        setActiveStep(3);
    };

    const handleProjectCreated = (projectUuid: string) => {
        setState((prev) => ({ ...prev, projectUuid }));
        setActiveStep(4);
    };

    return (
        <Page withFixedContent withPaddedContent>
            <Container size="sm" py="xl">
                <Stack gap="xl">
                    <div>
                        <Title order={1}>Create new project</Title>
                        <Text c="dimmed" mt="xs">
                            Connect your data warehouse and repository to get
                            started.
                        </Text>
                    </div>

                    <Stepper
                        active={activeStep}
                        onStepClick={setActiveStep}
                        size="sm"
                    >
                        <Stepper.Step
                            label="Warehouse"
                            allowStepSelect={false}
                        >
                            <Paper p="xl" mt="md" withBorder>
                                <OnboardingBigQueryStep
                                    onComplete={handleBigQueryComplete}
                                />
                            </Paper>
                        </Stepper.Step>

                        <Stepper.Step
                            label="GitHub"
                            allowStepSelect={state.bigqueryConnected}
                        >
                            <Paper p="xl" mt="md" withBorder>
                                <OnboardingGithubStep
                                    onComplete={handleGithubComplete}
                                />
                            </Paper>
                        </Stepper.Step>

                        <Stepper.Step
                            label="Repository"
                            allowStepSelect={state.githubConnected}
                        >
                            <Paper p="xl" mt="md" withBorder>
                                <OnboardingRepoStep
                                    onSelectRepo={handleRepoSelect}
                                />
                            </Paper>
                        </Stepper.Step>

                        <Stepper.Step
                            label="Project"
                            allowStepSelect={state.selectedRepo !== null}
                        >
                            <Paper p="xl" mt="md" withBorder>
                                <OnboardingCreateProjectStep
                                    selectedRepo={state.selectedRepo}
                                    gcpProjectId={state.gcpProjectId}
                                    onProjectCreated={handleProjectCreated}
                                />
                            </Paper>
                        </Stepper.Step>

                        <Stepper.Step
                            label="Dashboard"
                            allowStepSelect={state.projectUuid !== null}
                        >
                            <Paper p="xl" mt="md" withBorder>
                                {state.projectUuid && state.selectedRepo && (
                                    <OnboardingDashboardStep
                                        projectUuid={state.projectUuid}
                                        selectedRepo={state.selectedRepo}
                                        isNewRepo={state.selectedRepo.isNewRepo}
                                    />
                                )}
                            </Paper>
                        </Stepper.Step>
                    </Stepper>
                </Stack>
            </Container>
        </Page>
    );
};

export default OnboardingWizard;

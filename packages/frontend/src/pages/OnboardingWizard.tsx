import { Container, Paper, Stack, Stepper, Text, Title } from '@mantine/core';
import { type FC, useState } from 'react';
import Page from '../components/common/Page/Page';
import { OnboardingBigQueryStep } from '../components/OnboardingWizard/OnboardingBigQueryStep';
import { OnboardingCreateProjectStep } from '../components/OnboardingWizard/OnboardingCreateProjectStep';
import { OnboardingGithubStep } from '../components/OnboardingWizard/OnboardingGithubStep';
import { OnboardingRepoStep } from '../components/OnboardingWizard/OnboardingRepoStep';

type OnboardingState = {
    bigqueryConnected: boolean;
    gcpProjectId: string;
    githubConnected: boolean;
    selectedRepo: { owner: string; repo: string; branch: string } | null;
};

const OnboardingWizard: FC = () => {
    const [activeStep, setActiveStep] = useState(0);
    const [state, setState] = useState<OnboardingState>({
        bigqueryConnected: false,
        gcpProjectId: '',
        githubConnected: false,
        selectedRepo: null,
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
    }) => {
        setState((prev) => ({ ...prev, selectedRepo: repo }));
        setActiveStep(3);
    };

    return (
        <Page withFixedContent withPaddedContent>
            <Container size="md" py="xl">
                <Stack spacing="xl">
                    <div>
                        <Title order={1}>Set up your Lightdash project</Title>
                        <Text color="dimmed" mt="xs">
                            Connect your data warehouse and code repository to
                            get started.
                        </Text>
                    </div>

                    <Stepper active={activeStep} onStepClick={setActiveStep}>
                        <Stepper.Step
                            label="Warehouse"
                            description="Connect BigQuery"
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
                            description="Connect repository"
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
                            description="Select or create"
                            allowStepSelect={state.githubConnected}
                        >
                            <Paper p="xl" mt="md" withBorder>
                                <OnboardingRepoStep
                                    onSelectRepo={handleRepoSelect}
                                />
                            </Paper>
                        </Stepper.Step>

                        <Stepper.Step
                            label="Create Project"
                            description="Finish setup"
                            allowStepSelect={state.selectedRepo !== null}
                        >
                            <Paper p="xl" mt="md" withBorder>
                                <OnboardingCreateProjectStep
                                    selectedRepo={state.selectedRepo}
                                    gcpProjectId={state.gcpProjectId}
                                />
                            </Paper>
                        </Stepper.Step>
                    </Stepper>
                </Stack>
            </Container>
        </Page>
    );
};

export default OnboardingWizard;

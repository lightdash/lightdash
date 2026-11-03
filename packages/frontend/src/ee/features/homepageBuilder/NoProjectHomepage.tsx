import { FeatureFlags, ProjectType } from '@lightdash/common';
import { Stack, Text, Title } from '@mantine/core';
import { useRef, type FC } from 'react';
import { Navigate } from 'react-router';
import { DocumentTitle } from '../../../components/common/DocumentTitle';
import OnboardingLayout from '../../../components/common/OnboardingLayout';
import { ONBOARDING_DATA_STEPS } from '../../../components/common/onboardingSteps';
import { StepVisual } from '../../../components/common/OnboardingVisuals';
import PageSpinner from '../../../components/PageSpinner';
import { DataSourceChooser } from '../../../components/ProjectConnection/ProjectConnectFlow/DataSourceChooser';
import { useProjects } from '../../../hooks/useProjects';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { isPlaygroundProvisioningSource } from '../../../utils/playgroundProject';
import { useHomepageBuilderFlag } from './hooks/useProjectHomepage';

const NoProjectHomepage: FC = () => {
    const { data: projects, isInitialLoading } = useProjects();
    const orgSetupPageFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const homepageBuilderFlag = useHomepageBuilderFlag();
    // Judged on arrival only: a project made from this page navigates on its own.
    // The sample workspace doesn't count, so its users can still bring real data.
    const hadRealProjectOnArrival = useRef<boolean | null>(null);

    if (
        isInitialLoading ||
        orgSetupPageFlag.isLoading ||
        homepageBuilderFlag.isLoading
    ) {
        return <PageSpinner />;
    }

    if (!orgSetupPageFlag.data?.enabled) {
        return <Navigate to="/" replace />;
    }

    if (!homepageBuilderFlag.isEnabled) {
        return <Navigate to="/" replace />;
    }

    if (projects && hadRealProjectOnArrival.current === null) {
        hadRealProjectOnArrival.current = projects.some(
            ({ type, provisioningSource }) =>
                type === ProjectType.DEFAULT &&
                !isPlaygroundProvisioningSource(provisioningSource),
        );
    }

    if (hadRealProjectOnArrival.current) {
        return <Navigate to="/" replace />;
    }

    return (
        <OnboardingLayout
            screen="choose_source"
            journey={{ currentStep: 1, steps: ONBOARDING_DATA_STEPS }}
            aside={<StepVisual step="warehouse" />}
        >
            <DocumentTitle title="Get started" />
            <Stack gap="lg">
                <Stack gap="xs">
                    <Title order={1}>Where does your data live?</Title>
                    <Text c="dimmed" size="sm">
                        Connect it and you can start asking questions.
                    </Text>
                </Stack>
                <DataSourceChooser />
            </Stack>
        </OnboardingLayout>
    );
};

export default NoProjectHomepage;

import type { Meta, StoryObj } from '@storybook/react-vite';
import OnboardingDbt from '../../pages/OnboardingDbt';
import {
    OnboardingStory,
    PROJECT_UUID,
    storyProject,
    storyProjectSummary,
} from './storyApi';

const meta: Meta = {
    title: 'Onboarding/07 dbt',
    parameters: { layout: 'fullscreen' },
};
export default meta;

const routes = {
    'GET /org/projects': [storyProjectSummary],
    [`GET /projects/${PROJECT_UUID}`]: storyProject,
    [`GET /projects/${PROJECT_UUID}/explores`]: [],
};

export const MethodPicker: StoryObj = {
    name: 'Method picker',
    render: () => (
        <OnboardingStory
            path="/onboarding/dbt/:method?"
            url="/onboarding/dbt"
            element={<OnboardingDbt />}
            routes={routes}
        />
    ),
};

export const CliWaiting: StoryObj = {
    name: 'CLI · waiting for deploy',
    render: () => (
        <OnboardingStory
            path="/onboarding/dbt/:method?"
            url="/onboarding/dbt/cli"
            element={<OnboardingDbt />}
            routes={routes}
        />
    ),
};

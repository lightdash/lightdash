import type { Meta, StoryObj } from '@storybook/react-vite';
import OnboardingDataSource from '../../pages/OnboardingDataSource';
import { OnboardingStory, storyOrganization } from './storyApi';

const meta: Meta = {
    title: 'Onboarding/04 Data source',
    parameters: { layout: 'fullscreen' },
};
export default meta;

const routes = {
    'GET /org': storyOrganization({
        needsProject: true,
        defaultProjectUuid: undefined,
    }),
    'GET /org/projects': [],
};

export const WarehousePicker: StoryObj = {
    name: 'Warehouse picker',
    render: () => (
        <OnboardingStory
            path="/onboarding/data-source/:warehouse?"
            url="/onboarding/data-source"
            element={<OnboardingDataSource />}
            routes={routes}
        />
    ),
};

export const PostgresConnect: StoryObj = {
    name: 'Postgres connect form',
    render: () => (
        <OnboardingStory
            path="/onboarding/data-source/:warehouse?"
            url="/onboarding/data-source/postgres"
            element={<OnboardingDataSource />}
            routes={routes}
        />
    ),
};

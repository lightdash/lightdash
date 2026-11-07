import type { Meta, StoryObj } from '@storybook/react-vite';
import NoProjectHomepage from '../../ee/features/homepageBuilder/NoProjectHomepage';
import { OnboardingStory, storyOrganization } from './storyApi';

const meta: Meta = {
    title: 'Onboarding/03 Get started',
    parameters: { layout: 'fullscreen' },
};
export default meta;

export const NoProject: StoryObj = {
    name: 'No project yet',
    render: () => (
        <OnboardingStory
            path="/get-started"
            url="/get-started"
            element={<NoProjectHomepage />}
            routes={{
                'GET /org': storyOrganization({
                    needsProject: true,
                    defaultProjectUuid: undefined,
                }),
                'GET /org/projects': [],
                'GET /org/homepage-settings': { enabled: true },
            }}
        />
    ),
};

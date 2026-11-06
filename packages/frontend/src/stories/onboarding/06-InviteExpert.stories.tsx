import type { Meta, StoryObj } from '@storybook/react-vite';
import OnboardingInviteExpert from '../../pages/OnboardingInviteExpert';
import { OnboardingStory, storyHealth, storyOrganization } from './storyApi';

const meta: Meta = {
    title: 'Onboarding/06 Invite an expert',
    parameters: { layout: 'fullscreen' },
};
export default meta;

export const InviteExpert: StoryObj = {
    name: 'Invite a data expert',
    render: () => (
        <OnboardingStory
            path="/onboarding/invite-expert"
            url="/onboarding/invite-expert"
            element={<OnboardingInviteExpert />}
            routes={{
                'GET /health': storyHealth({ hasPlaygroundProjects: true }),
                'GET /org': storyOrganization({
                    needsProject: true,
                    defaultProjectUuid: undefined,
                }),
                'GET /org/projects': [],
            }}
        />
    ),
};

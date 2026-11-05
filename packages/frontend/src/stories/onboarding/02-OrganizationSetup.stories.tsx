import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import OrganizationSetup from '../../pages/OrganizationSetup';
import {
    OnboardingStory,
    ORG_UUID,
    storyOrganization,
    storyUser,
} from './storyApi';

const meta: Meta = {
    title: 'Onboarding/02 Organization setup',
    parameters: { layout: 'fullscreen' },
    render: () => (
        <OnboardingStory
            path="/organization-setup"
            url="/organization-setup"
            element={<OrganizationSetup />}
            routes={{
                'GET /user': storyUser({
                    organizationName: '',
                    isSetupComplete: false,
                }),
                'GET /org': storyOrganization({
                    name: '',
                    needsProject: true,
                }),
                'POST /org/brand/fetch': {
                    organizationUuid: ORG_UUID,
                    domain: 'example.com',
                    description: null,
                    fonts: [],
                    updatedAt: new Date('2026-11-02T10:30:00Z'),
                    name: 'Acme Coffee',
                    logos: [],
                    colors: [
                        { hex: '#7a4b2a', type: 'brand', brightness: 64 },
                        { hex: '#e8a33d', type: 'accent', brightness: 160 },
                    ],
                },
            }}
        />
    ),
};
export default meta;

type Story = StoryObj;

export const WorkspaceStep: Story = { name: 'Step 1 · Workspace' };

export const AboutYouStep: Story = {
    name: 'Step 2 · About you',
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(
            await canvas.findByRole(
                'button',
                { name: /continue/i },
                {
                    timeout: 5000,
                },
            ),
        );
    },
};

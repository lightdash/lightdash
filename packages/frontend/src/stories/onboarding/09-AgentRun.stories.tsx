import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import AgentOnboardingRunPage from '../../ee/features/agentOnboarding/AgentOnboardingRunPage';
import { storyAgentRun } from './agentRunFixture';
import {
    OnboardingStory,
    PROJECT_UUID,
    RUN_UUID,
    type StubRoutes,
    type StubRequest,
} from './storyApi';

const meta: Meta = {
    title: 'Onboarding/09 Agent onboarding run',
    parameters: { layout: 'fullscreen' },
};
export default meta;

const runStory = (completed: boolean): StoryObj => ({
    render: () => {
        const run = storyAgentRun(completed);
        const routes: StubRoutes = {
            [`GET /ee/projects/${PROJECT_UUID}/agent-onboarding/${RUN_UUID}`]:
                run,
            [`GET /ee/projects/${PROJECT_UUID}/agent-onboarding/${RUN_UUID}/file`]:
                ({ searchParams }: StubRequest) => {
                    const path = searchParams.get('path');
                    const file = run.files.find((entry) => entry.path === path);
                    if (!file) throw new Error(`Unknown story file: ${path}`);
                    return {
                        ...file,
                        encoding: 'utf8',
                        content:
                            path === 'handoff.md'
                                ? `# Your project is ready\n\n${run.handoff?.summary ?? ''}`
                                : 'version: 2\nmodels:\n  - name: orders\n    description: Customer orders\n    columns:\n      - name: order_id\n        description: Unique order identifier\n',
                    };
                },
        };
        return (
            <OnboardingStory
                path="/projects/:projectUuid/agent-onboarding/:agentOnboardingRunUuid"
                url={`/projects/${PROJECT_UUID}/agent-onboarding/${RUN_UUID}`}
                element={<AgentOnboardingRunPage />}
                withNavBar
                routes={routes}
            />
        );
    },
});

export const Running: StoryObj = {
    name: 'Running mid-stage',
    ...runStory(false),
};
export const Completed: StoryObj = {
    name: 'Completed with handoff',
    ...runStory(true),
    play: async ({ canvasElement }) => {
        const page = within(canvasElement.ownerDocument.body);
        await userEvent.click(
            await page.findByRole('button', { name: 'More setup options' }),
        );
        await userEvent.click(
            await page.findByRole('menuitem', { name: 'View code' }),
        );
        await userEvent.click(await page.findByText('handoff.md'));
    },
};

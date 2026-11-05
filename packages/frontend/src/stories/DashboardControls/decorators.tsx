import { type Decorator } from '@storybook/react-vite';
import { sections } from './fixtures';
import { type DashboardStoryParameters } from './storyParameters';
import { StoryFrame } from './StoryProviders';

/** The shared dashboard fixture; `parameters.dashboard` tunes it. */
export const withStoryFrame: Decorator = (Story, { parameters }) => {
    const options: DashboardStoryParameters = parameters.dashboard ?? {};
    return (
        <StoryFrame
            startOfWeek={options.startOfWeek ?? null}
            sections={options.sections ?? sections}
        >
            <Story />
        </StoryFrame>
    );
};

import { type Decorator } from '@storybook/react-vite';
import { sections } from './fixtures';
import { type DashboardStoryParameters } from './storyParameters';
import { StoryFrame } from './StoryProviders';

/** The providers every prototype story sits in; `parameters.dashboard` tunes them. */
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

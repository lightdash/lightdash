import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import {
    ChartTypeSavedQueryPoc,
    type ChartTypeSavedQueryPocState,
} from './ChartTypeSavedQueryPoc';

const meta: Meta<typeof ChartTypeSavedQueryPoc> = {
    title: 'Chart types/Saved query POC',
    component: ChartTypeSavedQueryPoc,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'A local-only prototype for choosing a sample saved query and describing a chart type. The static bars and accessible table show the same fixture rows; no API request or chart-type generation runs from this story.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ChartTypeSavedQueryPoc>;

const story = (state: ChartTypeSavedQueryPocState): Story => ({
    args: { state },
});

export const StartHere = story('ready');

export const HappyPath: Story = {
    args: { state: 'ready' },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(
            canvas.getByRole('button', { name: /monthly revenue/i }),
        );
        await userEvent.type(
            canvas.getByRole('textbox', {
                name: '2. Describe your chart type',
            }),
            'Compare revenue month over month',
        );
        await userEvent.click(
            canvas.getByRole('button', { name: 'Build chart type' }),
        );
    },
};
export const Loading = story('loading');
export const Unavailable = story('error');
export const Empty = story('empty');
export const NoMatches = story('no-matches');

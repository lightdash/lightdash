import { metricQueryOfSemanticNode } from '@lightdash/common';
import { Box } from '@mantine/core';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { SemanticQueryDetails } from '../ee/features/aiCopilot/components/ChatElements/SemanticQueryDetails';
import {
    ordersFieldsMap,
    ordersParameters,
    ordersSemanticNode,
} from './fixtures/semanticQueryStoryData';
import SemanticQueryStoryProviders from './fixtures/SemanticQueryStoryProviders';

const meta = {
    component: SemanticQueryDetails,
    title: 'AI Agent/Semantic query details',
    decorators: [
        (Story) => (
            <SemanticQueryStoryProviders>
                <Box w={640} p="md">
                    <Story />
                </Box>
            </SemanticQueryStoryProviders>
        ),
    ],
    args: {
        metricQuery: metricQueryOfSemanticNode(ordersSemanticNode),
        fieldsMap: ordersFieldsMap,
        parameters: ordersParameters,
        showFields: true,
        showFilters: true,
        showSortAndLimit: true,
    },
} satisfies Meta<typeof SemanticQueryDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

const expand: Story['play'] = async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /^Fields/ }));
};

export const Collapsed: Story = {};

export const Expanded: Story = { play: expand };

/** Explore still loading or unavailable: labels fall back to field ids. */
export const WithoutExplore: Story = {
    args: { fieldsMap: {} },
    play: expand,
};

export const LimitOnly: Story = {
    args: {
        metricQuery: {
            ...metricQueryOfSemanticNode(ordersSemanticNode),
            filters: {},
            sorts: [],
        },
        parameters: {},
    },
    play: expand,
};

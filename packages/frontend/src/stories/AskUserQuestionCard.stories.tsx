import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AskUserQuestionCard } from '../ee/features/aiCopilot/components/ChatElements/AskUserQuestionCard';

const meta: Meta<typeof AskUserQuestionCard> = {
    title: 'AI agents/Ask user question card',
    component: AskUserQuestionCard,
    args: { onSubmit: () => {} },
    decorators: [
        (renderStory) => (
            <Box w={640} p="md">
                {renderStory()}
            </Box>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof AskUserQuestionCard>;

export const SingleSelect: Story = {
    args: {
        questions: [
            {
                header: 'Chart idea',
                question: 'What kind of chart would you like?',
                options: [
                    {
                        label: 'Two stacked panels',
                        description:
                            'Two charts, one above the other, with the top in grey and the bottom in ginger.',
                    },
                    {
                        label: 'Two-series chart',
                        description:
                            'One chart comparing two series, such as orders by status or users over time.',
                    },
                    {
                        label: 'Grid of charts',
                        description: 'A dashboard of tiles.',
                    },
                ],
                multiSelect: false,
            },
            {
                header: 'Data',
                question: 'Which data should it show?',
                options: [
                    { label: 'Orders', description: '' },
                    { label: 'Customers', description: '' },
                ],
                multiSelect: false,
            },
        ],
    },
};

export const MultiSelect: Story = {
    args: {
        questions: [
            {
                header: 'Metrics',
                question: 'Which metrics?',
                options: [
                    { label: 'Revenue', description: 'Total order amount' },
                    { label: 'Orders', description: 'Count of orders' },
                    { label: 'Customers', description: '' },
                ],
                multiSelect: true,
            },
        ],
    },
};

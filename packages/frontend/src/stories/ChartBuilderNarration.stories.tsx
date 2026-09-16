import { Box, Stack, Text, Textarea } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import AppVersionNarration from '../features/apps/components/AppVersionNarration';
import promptBar from '../features/chartTypes/builder/BuilderPromptBar.module.css';

const meta: Meta<typeof AppVersionNarration> = {
    title: 'Chart types/Builder narration',
    component: AppVersionNarration,
    parameters: { layout: 'fullscreen' },
    args: {
        isLive: true,
        className: promptBar.liveNarration,
    },
    decorators: [
        (renderStory) => (
            <Stack h="100dvh" justify="flex-end" p="xl">
                <Box className={promptBar.pillHost} mx="auto">
                    <Box
                        className={promptBar.queue}
                        data-building
                        data-narration
                    >
                        <Box
                            className={`${promptBar.stackRow} ${promptBar.buildingStatus}`}
                            data-has-narration="true"
                        >
                            <Text size="xs">Building… 0:42</Text>
                        </Box>
                        {renderStory()}
                    </Box>
                    <Textarea
                        aria-label="Chart prompt preview"
                        placeholder="Describe your chart type…"
                        readOnly
                    />
                </Box>
            </Stack>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof AppVersionNarration>;

export const LongContent: Story = {
    args: {
        narration: {
            reasoning: Array.from(
                { length: 40 },
                (_, index) =>
                    `**Reasoning step ${index + 1}.** Compare revenue across regions using a horizontal bar chart. Keep labels readable, sort categories by total revenue, and preserve the selected filters. Check missing values and explain the result clearly before choosing the final layout.`,
            ),
            activity: Array.from(
                { length: 40 },
                (_, index) =>
                    `**Build step ${index + 1}.** Updating \`Chart.tsx\` with the selected dimensions and metrics. Checking the sample rows, rendering the preview, and validating that tooltips and axis labels match the requested chart configuration.`,
            ),
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(
            canvas.getByRole('button', { name: /^Reasoning/ }),
        );
        await userEvent.click(
            canvas.getByRole('button', { name: /^Activity/ }),
        );
    },
};

export const ShortContent: Story = {
    args: {
        narration: {
            reasoning: ['Choosing a horizontal bar chart.'],
            activity: ['Updating Chart.tsx.'],
        },
    },
    play: LongContent.play,
};

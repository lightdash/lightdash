import {
    type DataAppVizOptionValues,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ComponentProps } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import ConfigurePanel from '../features/chartTypes/builder/ConfigurePanel';
import { createQueryClient } from '../providers/ReactQuery/createQueryClient';

const schema: DataAppVizSchema = {
    fields: [
        { name: 'date', label: 'Date', type: 'dimension', required: true },
        { name: 'group', label: 'Group by', type: 'series', required: false },
        { name: 'value', label: 'Value(s)', type: 'metric', required: true },
    ],
    configOptions: [
        {
            name: 'legend',
            label: 'Show legend',
            type: 'boolean',
            default: true,
        },
        {
            name: 'opacity',
            label: 'Fill opacity',
            type: 'number',
            default: 0.85,
            min: 0,
            max: 1,
        },
    ],
    colorPalette: {},
};

const InteractiveSidebar = (props: ComponentProps<typeof ConfigurePanel>) => {
    const [values, setValues] = useState<DataAppVizOptionValues>({});
    const [palette, setPalette] = useState<string | null>(null);
    const [client] = useState(() => {
        const queryClient = createQueryClient({
            queries: { staleTime: Infinity, retry: false },
        });
        queryClient.setQueryData(['color_palettes'], []);
        return queryClient;
    });

    return (
        <QueryClientProvider client={client}>
            <Box h={560} display="flex">
                <ConfigurePanel
                    {...props}
                    optionValues={values}
                    onOptionChange={(name, value) =>
                        setValues((current) => ({ ...current, [name]: value }))
                    }
                    colorPaletteUuid={palette}
                    onPaletteChange={setPalette}
                />
            </Box>
        </QueryClientProvider>
    );
};

const meta = {
    title: 'Chart types/Studio sidebar',
    component: ConfigurePanel,
    render: (args) => <InteractiveSidebar {...args} />,
    args: {
        schema,
        optionValues: {},
        colorPaletteUuid: null,
        resolvedColorPalette: ['#526FD6', '#FA8451', '#91CC75'],
        isStale: false,
        onOptionChange: () => undefined,
        onPaletteChange: () => undefined,
    },
    parameters: {
        docs: {
            description: {
                component:
                    'The real Chart Studio sidebar: inputs in General, generated controls in Display, and a quiet sample-data note that stays visible across tabs. Uses a fixture schema and an in-memory palette cache.',
            },
        },
    },
} satisfies Meta<typeof ConfigurePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const General: Story = {};

export const Display: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('tab', { name: 'Display' }));
        await expect(canvas.getByLabelText('Show legend')).toBeChecked();
        await userEvent.click(canvas.getByLabelText('Show legend'));
        await expect(canvas.getByLabelText('Show legend')).not.toBeChecked();
        await expect(
            canvas.getByText('Preview uses sample data.'),
        ).toBeVisible();
    },
};

export const InputsOnly: Story = {
    args: { schema: { ...schema, configOptions: [], colorPalette: null } },
};

export const UpdatingVersion: Story = { args: { isStale: true } };

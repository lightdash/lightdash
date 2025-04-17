import type { Meta, StoryObj } from '@storybook/react';

import Tree from './Tree';
import { response } from './test.json';

const meta: Meta<typeof Tree> = {
    component: Tree,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tree>;

export const Primary: Story = {
    args: {
        data: response.results,
        onSelect: (selectedUuid) => {
            console.log('Selected item UUID:', selectedUuid);
        },
    },
};

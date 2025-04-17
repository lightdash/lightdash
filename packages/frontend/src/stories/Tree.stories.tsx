import type { Meta, StoryObj } from '@storybook/react';

const Tree = () => {
    return <>tree</>;
};

const meta: Meta<typeof Tree> = {
    component: Tree,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tree>;

export const Primary: Story = {
    args: {},
};

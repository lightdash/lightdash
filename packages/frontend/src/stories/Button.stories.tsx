import { Button } from '@mantine-8/core';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Button> = {
    component: Button,
    tags: ['autodocs'],
    argTypes: {
        variant: {
            control: 'select',
            options: ['dark', 'default'],
            defaultValue: 'dark',
        },
        loading: {
            control: 'boolean',
            defaultValue: false,
        },
        disabled: {
            control: 'boolean',
            defaultValue: false,
        },
        radius: {
            control: 'select',
            options: ['xs', 'sm', 'md', 'lg', 'xl'],
            defaultValue: 'md',
        },
    },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const PrimaryButton: Story = {
    args: {
        children: 'Primary Button',
        variant: 'dark',
        radius: 'md',
        loading: false,
        disabled: false,
    },
};

export const SecondaryButton: Story = {
    args: {
        children: 'Secondary Button',
        variant: 'default',
        radius: 'md',
        loading: false,
        disabled: false,
    },
};

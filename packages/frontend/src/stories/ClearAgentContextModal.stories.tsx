import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import ClearAgentContextModal from '../features/apps/components/ClearAgentContextModal';

const meta: Meta<typeof ClearAgentContextModal> = {
    title: 'Data apps/Clear agent context modal',
    component: ClearAgentContextModal,
    args: { opened: true, loading: false, onClose: fn(), onConfirm: fn() },
};

export default meta;

type Story = StoryObj<typeof ClearAgentContextModal>;

export const Default: Story = {};

/** The clear request is in flight: neither button can be pressed. */
export const Loading: Story = { args: { loading: true } };

export const Closed: Story = { args: { opened: false } };

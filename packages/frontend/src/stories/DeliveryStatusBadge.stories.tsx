import type { Meta, StoryObj } from '@storybook/react-vite';
import DeliveryStatusBadge from '../components/SchedulersView/DeliveryStatusBadge';

const meta = {
    title: 'Scheduled Deliveries/Status',
    component: DeliveryStatusBadge,
    parameters: { layout: 'centered' },
    argTypes: {
        enabled: { control: 'boolean' },
        automaticallyDisabledReason: { name: 'Pause reason', control: 'text' },
    },
} satisfies Meta<typeof DeliveryStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scheduled: Story = { args: { enabled: true } };

export const Paused: Story = { args: { enabled: false } };

export const AutomaticallyPaused: Story = {
    args: {
        enabled: false,
        automaticallyDisabledReason:
            'A resource required by this Google Sheets sync could not be found.',
    },
};

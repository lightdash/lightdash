import { type Meta, type StoryObj } from '@storybook/react-vite';
import RoadmapMockContent from '../ee/features/roadmap/RoadmapMockContent';

const meta = {
    title: 'Roadmap/Project board',
    component: RoadmapMockContent,
    args: { scenario: 'populated' },
} satisfies Meta<typeof RoadmapMockContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
export const Empty: Story = { args: { scenario: 'empty' } };
export const Loading: Story = { args: { scenario: 'loading' } };
export const Error: Story = { args: { scenario: 'error' } };
export const RemovedProject: Story = { args: { scenario: 'removed' } };
export const MissingTitle: Story = { args: { scenario: 'missing-title' } };
export const Pagination: Story = { args: { scenario: 'pagination' } };
export const Expiry: Story = { args: { scenario: 'expiry' } };

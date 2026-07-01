import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { SelectedQuerySection } from './AppResourcePicker';

const baseChart = {
    uuid: 'c1',
    name: 'Rev',
    includeSampleData: false,
    linkLive: false,
};

it('calls onToggleLink when the Link live button is clicked', () => {
    const onToggleLink = vi.fn();
    render(
        <MantineProvider>
            <SelectedQuerySection
                charts={[baseChart]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={onToggleLink}
            />
        </MantineProvider>,
    );
    fireEvent.click(screen.getByLabelText('Link live'));
    expect(onToggleLink).toHaveBeenCalledWith('c1');
});

it('hides the sample-data control when the chart is linked', () => {
    render(
        <MantineProvider>
            <SelectedQuerySection
                charts={[{ ...baseChart, linkLive: true }]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={() => {}}
            />
        </MantineProvider>,
    );
    expect(screen.queryByLabelText('Include sample data')).toBeNull();
    expect(screen.getByLabelText('Linked: on')).toBeInTheDocument();
});

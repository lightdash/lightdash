import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import {
    ConnectionAttachButton,
    SelectedQuerySection,
} from './AppResourcePicker';

const baseChart = {
    uuid: 'c1',
    name: 'Rev',
    includeSampleData: false,
    linkLive: false,
};

it('calls onToggleLink when the Link live button is clicked', () => {
    const onToggleLink = vi.fn();
    render(
        <MantineProvider env="test">
            <SelectedQuerySection
                charts={[baseChart]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={onToggleLink}
                sampleDataEnabled
            />
        </MantineProvider>,
    );
    fireEvent.click(screen.getByLabelText('Link live'));
    expect(onToggleLink).toHaveBeenCalledWith('c1');
});

it('hides the sample-data control when the chart is linked', () => {
    render(
        <MantineProvider env="test">
            <SelectedQuerySection
                charts={[{ ...baseChart, linkLive: true }]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={() => {}}
                sampleDataEnabled
            />
        </MantineProvider>,
    );
    expect(screen.queryByLabelText('Include sample data')).toBeNull();
    expect(screen.getByLabelText('Linked: on')).toBeInTheDocument();
});

it('hides the sample-data controls when the instance disables sample data', () => {
    render(
        <MantineProvider env="test">
            <SelectedQuerySection
                charts={[baseChart]}
                onRemove={() => {}}
                onToggleSampleData={() => {}}
                onToggleLink={() => {}}
                sampleDataEnabled={false}
            />
        </MantineProvider>,
    );
    expect(screen.queryByLabelText('Include sample data')).toBeNull();
    expect(screen.getByLabelText('Link live')).toBeInTheDocument();
});

it.each([
    { count: 0, label: 'Connections' },
    { count: 1, label: '1 connection' },
    { count: 2, label: '2 connections' },
])(
    'summarizes $count selected connections in the trigger',
    ({ count, label }) => {
        render(
            <MantineProvider env="test">
                <ConnectionAttachButton
                    selectedConnections={Array.from(
                        { length: count },
                        (_, index) => ({
                            externalConnectionUuid: `connection-${index}`,
                            name: `Connection ${index}`,
                            alias: `connection_${index}`,
                        }),
                    )}
                    onSelect={() => undefined}
                    onDeselect={() => undefined}
                    disabled={false}
                    description="Choose connections"
                />
            </MantineProvider>,
        );

        expect(
            screen.getByRole('button', { name: 'Add external connections' }),
        ).toHaveTextContent(label);
    },
);

import { type ExternalConnection } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import {
    ConnectionAttachButton,
    ConnectionPickerView,
    SelectedQuerySection,
} from './AppResourcePicker';

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: undefined } }),
}));
vi.mock('../externalConnections/hooks/useExternalConnections', () => ({
    useExternalConnections: () => ({
        isInitialLoading: false,
        data: [
            { externalConnectionUuid: 'c-linked', name: 'Linked API' },
            { externalConnectionUuid: 'c-selected', name: 'Selected API' },
            { externalConnectionUuid: 'c-plain', name: 'Plain API' },
        ].map((connection) => ({
            ...connection,
            origin: `https://${connection.externalConnectionUuid}.example.com`,
        })) as unknown as ExternalConnection[],
    }),
}));
vi.mock('../externalConnections/hooks/useAppExternalConnections', () => ({
    useAppExternalConnections: (
        _projectUuid: string | undefined,
        appUuid: string | undefined,
    ) => ({
        data: appUuid
            ? [
                  {
                      alias: 'linked_api',
                      connection: { externalConnectionUuid: 'c-linked' },
                  },
                  {
                      alias: 'selected_api',
                      connection: { externalConnectionUuid: 'c-selected' },
                  },
              ]
            : undefined,
    }),
}));

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
    { count: 0, label: 'Add external connections' },
    { count: 1, label: '1 external connection attached' },
    { count: 2, label: '2 external connections attached' },
])(
    'summarizes $count selected connections with an indicator',
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
                    linkedAppUuid={null}
                />
            </MantineProvider>,
        );

        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
        if (count === 0) {
            expect(screen.queryByText('0')).not.toBeInTheDocument();
        } else {
            expect(screen.getByText(String(count))).toBeInTheDocument();
        }
    },
);

it('marks connections the app already links, unless they are selected again', () => {
    render(
        <MantineProvider env="test">
            <ConnectionPickerView
                selectedConnections={[
                    {
                        externalConnectionUuid: 'c-selected',
                        name: 'Selected API',
                        alias: 'selected_api',
                    },
                ]}
                onSelect={() => undefined}
                onDeselect={() => undefined}
                onDone={() => undefined}
                enabled
                linkedAppUuid="app-1"
            />
        </MantineProvider>,
    );

    const hints = screen.getAllByText('Linked');
    expect(hints).toHaveLength(1);
    expect(hints[0].parentElement).toHaveTextContent('Linked API');
});

it('shows no linked hint before a first build exists', () => {
    render(
        <MantineProvider env="test">
            <ConnectionPickerView
                selectedConnections={[]}
                onSelect={() => undefined}
                onDeselect={() => undefined}
                onDone={() => undefined}
                enabled
            />
        </MantineProvider>,
    );

    expect(screen.queryByText('Linked')).not.toBeInTheDocument();
});

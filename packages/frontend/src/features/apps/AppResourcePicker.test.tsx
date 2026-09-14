import { ContentType, type ExternalConnection } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import {
    AttachButton,
    ConnectionAttachButton,
    ConnectionPickerView,
    SelectedQuerySection,
} from './AppResourcePicker';

const contentMocks = vi.hoisted(() => ({
    fetchNextPage: vi.fn(),
    useInfiniteContent: vi.fn(() => ({
        data: {
            pages: [
                {
                    data: [
                        {
                            contentType: 'dashboard',
                            uuid: 'dashboard-1',
                            name: 'Revenue dashboard',
                        },
                    ],
                },
            ],
        },
        isInitialLoading: false,
        isFetching: false,
        hasNextPage: true,
        fetchNextPage: contentMocks.fetchNextPage,
    })),
}));

vi.mock('../../hooks/useContent', () => ({
    useInfiniteContent: contentMocks.useInfiniteContent,
}));

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
const unlink = vi.fn();
vi.mock('../externalConnections/hooks/useUnlinkAppExternalConnection', () => ({
    useUnlinkAppExternalConnection: () => ({ mutate: unlink }),
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
                      connection: {
                          externalConnectionUuid: 'c-linked',
                          name: 'Linked API',
                          origin: 'https://c-linked.example.com',
                      },
                  },
                  {
                      alias: 'selected_api',
                      connection: {
                          externalConnectionUuid: 'c-selected',
                          name: 'Selected API',
                          origin: 'https://c-selected.example.com',
                      },
                  },
                  ...(appUuid === 'app-with-admin-only-link'
                      ? [
                            {
                                alias: 'admin_only_api',
                                connection: {
                                    externalConnectionUuid: 'c-admin-only',
                                    name: 'Admin-only API',
                                    origin: 'https://admin-only.example.com',
                                },
                            },
                        ]
                      : []),
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

it('loads the next page of dashboards from content search', () => {
    contentMocks.fetchNextPage.mockClear();
    contentMocks.useInfiniteContent.mockClear();

    render(
        <MantineProvider env="test">
            <AttachButton
                selectedCharts={[]}
                onSelectChart={() => undefined}
                onDeselectChart={() => undefined}
                selectedDashboard={null}
                onSelectDashboard={() => undefined}
                onDeselectDashboard={() => undefined}
                selectedConnections={[]}
                onSelectConnection={() => undefined}
                onDeselectConnection={() => undefined}
                onAddFiles={() => undefined}
                disabled={false}
                filesDisabled={false}
            />
        </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Attach resources' }));
    fireEvent.click(screen.getByRole('button', { name: /Dashboard/ }));

    expect(screen.getByText('Revenue dashboard')).toBeInTheDocument();
    expect(contentMocks.useInfiniteContent).toHaveBeenCalledWith(
        expect.objectContaining({
            projectUuids: ['project-1'],
            contentTypes: [ContentType.DASHBOARD],
            pageSize: 25,
        }),
        expect.objectContaining({ enabled: true }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(contentMocks.fetchNextPage).toHaveBeenCalledOnce();
});

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

it('counts linked and newly selected connections together, without double counting', () => {
    render(
        <MantineProvider env="test">
            <ConnectionAttachButton
                selectedConnections={[
                    {
                        externalConnectionUuid: 'c-selected',
                        name: 'Selected API',
                        alias: 'selected_api',
                    },
                    {
                        externalConnectionUuid: 'c-plain',
                        name: 'Plain API',
                        alias: 'plain_api',
                    },
                ]}
                onSelect={() => undefined}
                onDeselect={() => undefined}
                disabled={false}
                description="Choose connections"
                linkedAppUuid="app-1"
            />
        </MantineProvider>,
    );

    expect(
        screen.getByRole('button', { name: '3 external connections attached' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
});

it('confirms before unlinking a checked connection', () => {
    unlink.mockClear();
    const onSelect = vi.fn();
    const onDeselect = vi.fn();
    render(
        <MantineProvider env="test">
            <ConnectionAttachButton
                selectedConnections={[]}
                onSelect={onSelect}
                onDeselect={onDeselect}
                disabled={false}
                description="Choose connections"
                linkedAppUuid="app-1"
            />
        </MantineProvider>,
    );

    fireEvent.click(
        screen.getByRole('button', {
            name: '2 external connections attached',
        }),
    );

    const linkedRow = screen.getByRole('checkbox', { name: /Linked API/ });
    expect(linkedRow).toBeChecked();
    expect(
        screen.getByRole('checkbox', { name: /Plain API/ }),
    ).not.toBeChecked();

    fireEvent.click(linkedRow);
    expect(unlink).not.toHaveBeenCalled();
    expect(
        screen.getByText(
            'You may not be able to link it again without help from a project admin.',
            { exact: false },
        ),
    ).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', {
        name: 'Unlink connection',
    });
    fireEvent.mouseDown(confirmButton);
    fireEvent.click(confirmButton);
    expect(unlink).toHaveBeenCalledWith({
        projectUuid: 'project-1',
        appUuid: 'app-1',
        alias: 'linked_api',
        name: 'Linked API',
    });
    expect(onDeselect).toHaveBeenCalledWith('c-linked');
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Plain API/ }));
    expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ externalConnectionUuid: 'c-plain' }),
    );
});

it('keeps the app picker mounted until an unlink confirmation completes', () => {
    unlink.mockClear();
    const onDeselectConnection = vi.fn();
    render(
        <MantineProvider env="test">
            <AttachButton
                selectedCharts={[]}
                onSelectChart={() => undefined}
                onDeselectChart={() => undefined}
                selectedDashboard={null}
                onSelectDashboard={() => undefined}
                onDeselectDashboard={() => undefined}
                selectedConnections={[]}
                onSelectConnection={() => undefined}
                onDeselectConnection={onDeselectConnection}
                onAddFiles={() => undefined}
                disabled={false}
                filesDisabled={false}
                linkedAppUuid="app-with-admin-only-link"
            />
        </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Attach resources' }));
    fireEvent.click(
        screen.getByRole('button', { name: /External connections/ }),
    );

    const linkedRow = screen.getByRole('checkbox', {
        name: /Admin-only API/,
    });
    expect(linkedRow).toBeChecked();

    fireEvent.click(linkedRow);
    expect(unlink).not.toHaveBeenCalled();

    const keepButton = screen.getByRole('button', { name: 'Keep connection' });
    fireEvent.mouseDown(keepButton);
    fireEvent.click(keepButton);
    expect(unlink).not.toHaveBeenCalled();
    expect(onDeselectConnection).not.toHaveBeenCalled();
    expect(
        screen.getByRole('checkbox', { name: /Admin-only API/ }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: /Admin-only API/ }));
    const confirmButton = screen.getByRole('button', {
        name: 'Unlink connection',
    });
    fireEvent.mouseDown(confirmButton);
    fireEvent.click(confirmButton);

    expect(unlink).toHaveBeenCalledWith({
        projectUuid: 'project-1',
        appUuid: 'app-with-admin-only-link',
        alias: 'admin_only_api',
        name: 'Admin-only API',
    });
    expect(onDeselectConnection).toHaveBeenCalledWith('c-admin-only');
});

it('never unlinks before a first build exists', () => {
    unlink.mockClear();
    const onSelect = vi.fn();
    render(
        <MantineProvider env="test">
            <ConnectionPickerView
                selectedConnections={[]}
                onSelect={onSelect}
                onDeselect={() => undefined}
                onDone={() => undefined}
                enabled
            />
        </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Linked API/ }));
    expect(unlink).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ externalConnectionUuid: 'c-linked' }),
    );
});

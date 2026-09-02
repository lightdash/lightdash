import {
    type EmbedProjectApp,
    type ExternalConnectionLinkedApps,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionsTable } from './ConnectionsTable';
import { ConnectionUsageModal } from './ConnectionUsageModal';

const mocks = vi.hoisted(() => ({
    data: { items: [], total: 0 } as ExternalConnectionLinkedApps,
    refetch: vi.fn(),
    unlink: vi.fn(),
    link: vi.fn(),
    projectApps: [] as EmbedProjectApp[],
    projectChartTypes: [] as EmbedProjectApp[],
}));

vi.mock('../../../features/apps/hooks/useProjectApps', () => ({
    useProjectAppsByKind: (
        _projectUuid: string,
        kind: 'data_app' | 'project_chart_type',
    ) => ({
        data: kind === 'data_app' ? mocks.projectApps : mocks.projectChartTypes,
        isLoading: false,
        isError: false,
    }),
}));

vi.mock(
    '../../../features/externalConnections/hooks/useExternalConnectionLinkedApps',
    () => ({
        useExternalConnectionLinkedApps: () => ({
            data: mocks.data,
            isLoading: false,
            isError: false,
            refetch: mocks.refetch,
        }),
    }),
);

vi.mock(
    '../../../features/externalConnections/hooks/useUnlinkAppExternalConnection',
    () => ({
        useUnlinkAppExternalConnection: () => ({
            mutate: mocks.unlink,
            isLoading: false,
        }),
    }),
);

vi.mock(
    '../../../features/externalConnections/hooks/useLinkAppExternalConnection',
    () => ({
        useLinkAppExternalConnection: () => ({
            mutate: mocks.link,
            isLoading: false,
        }),
    }),
);

const connection: ExternalConnectionListItem = {
    externalConnectionUuid: 'connection-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'organization-uuid',
    name: 'Example API',
    slug: 'example-api',
    type: 'none',
    origin: 'https://api.example.com',
    allowBrowserImages: false,
    allowDataAppBuilderLinking: false,
    instructions: null,
    allowedPathPrefixes: ['/'],
    allowedMethods: ['GET'],
    allowedContentTypes: ['application/json'],
    responseMaxBytes: 1_048_576,
    requestMaxBytes: 262_144,
    timeoutMs: 10_000,
    rateLimitPerMinute: null,
    apiKeyName: null,
    apiKeyLocation: null,
    oauthScopes: null,
    customHeaders: null,
    hasSecret: false,
    createdByUserUuid: 'user-uuid',
    updatedByUserUuid: 'user-uuid',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    linkedDataAppCount: 0,
    linkedChartTypeCount: 0,
};

const renderWithRouter = (component: React.ReactNode) =>
    render(
        <MemoryRouter>
            <MantineProvider env="test">{component}</MantineProvider>
        </MemoryRouter>,
    );

const UsageHarness: FC = () => {
    const [selected, setSelected] = useState<
        ExternalConnectionListItem | undefined
    >();

    return (
        <>
            <ConnectionsTable
                connections={[connection]}
                setConnectionToEdit={vi.fn()}
                setConnectionToDelete={vi.fn()}
                setConnectionToViewUsage={setSelected}
            />
            {selected && (
                <ConnectionUsageModal
                    opened
                    onClose={() => setSelected(undefined)}
                    projectUuid="project-uuid"
                    connection={selected}
                />
            )}
        </>
    );
};

describe('external connection usage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.data = { items: [], total: 0 };
        mocks.projectApps = [];
        mocks.projectChartTypes = [];
    });

    it('opens the usage modal from a zero count', () => {
        renderWithRouter(<UsageHarness />);

        fireEvent.click(
            screen.getByRole('button', {
                name: 'View 0 data apps and 0 chart types linked to Example API',
            }),
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Linked to “Example API”')).toBeInTheDocument();
        expect(
            screen.getByRole('tab', { name: 'Data apps (0)' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('tab', { name: 'Chart types (0)' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('textbox', { name: 'Link a data app' }),
        ).toBeInTheDocument();
    });

    it('keeps chart-type-only usage visible and clickable', () => {
        const setConnectionToViewUsage = vi.fn();
        renderWithRouter(
            <ConnectionsTable
                connections={[
                    {
                        ...connection,
                        linkedChartTypeCount: 2,
                    },
                ]}
                setConnectionToEdit={vi.fn()}
                setConnectionToDelete={vi.fn()}
                setConnectionToViewUsage={setConnectionToViewUsage}
            />,
        );

        const linkedAppsButton = screen.getByRole('button', {
            name: 'View 0 data apps and 2 chart types linked to Example API',
        });
        expect(linkedAppsButton).toHaveTextContent(
            '0 data apps + 2 chart types',
        );

        fireEvent.click(linkedAppsButton);
        expect(setConnectionToViewUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                externalConnectionUuid: 'connection-uuid',
            }),
        );
    });

    it('shows linked resources and confirms before unlinking every alias', () => {
        mocks.data = {
            items: [
                {
                    appUuid: 'app-1',
                    name: 'Revenue dashboard',
                    slug: 'revenue-dashboard',
                    kind: 'data_app',
                    spaceUuid: 'space-1',
                    spaceName: 'Sales',
                    aliases: ['acme', 'acme-v2'],
                },
                {
                    appUuid: 'chart-type-1',
                    name: 'Region map',
                    slug: 'region-map',
                    kind: 'project_chart_type',
                    spaceUuid: null,
                    spaceName: null,
                    aliases: ['maps'],
                },
            ],
            total: 2,
        };

        renderWithRouter(
            <ConnectionUsageModal
                opened
                onClose={vi.fn()}
                projectUuid="project-uuid"
                connection={connection}
            />,
        );

        expect(
            screen.getByRole('tab', { name: 'Data apps (1)' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('tab', { name: 'Chart types (1)' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Revenue dashboard/ }),
        ).toHaveAttribute('href', '/projects/project-uuid/apps/app-1');
        expect(
            screen.queryByRole('link', { name: /Region map/ }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'Chart types (1)' }));
        expect(
            screen.getByRole('link', { name: /Region map/ }),
        ).toHaveAttribute(
            'href',
            '/projects/project-uuid/chart-types/chart-type-1',
        );
        expect(screen.queryByText(/Aliases?:/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'Data apps (1)' }));

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Unlink Revenue dashboard',
            }),
        );

        const confirmation = screen
            .getByText('Unlink Example API?')
            .closest('[role="dialog"]');
        expect(confirmation).toHaveTextContent(
            'Unlinking removes access to this connection.',
        );
        expect(confirmation).not.toHaveTextContent(
            'You may not be able to link it again without help from a project admin.',
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Unlink connection' }),
        );
        expect(mocks.unlink).toHaveBeenCalledWith(
            {
                projectUuid: 'project-uuid',
                appUuid: 'app-1',
                aliases: ['acme', 'acme-v2'],
                name: 'Example API',
            },
            expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
    });

    it('links an unlinked data app from the inline add row', () => {
        mocks.data = {
            items: [
                {
                    appUuid: 'app-1',
                    name: 'Already linked',
                    slug: 'already-linked',
                    kind: 'data_app',
                    spaceUuid: null,
                    spaceName: null,
                    aliases: ['example_api'],
                },
            ],
            total: 1,
        };
        mocks.projectApps = [
            {
                appUuid: 'app-1',
                name: 'Already linked',
                slug: 'already-linked',
            },
            {
                appUuid: 'app-2',
                name: 'Revenue dashboard',
                slug: 'revenue-dashboard',
            },
        ];
        renderWithRouter(
            <ConnectionUsageModal
                opened
                onClose={vi.fn()}
                projectUuid="project-uuid"
                connection={connection}
            />,
        );

        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(
            screen.getByRole('link', { name: /Already linked/ }),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('textbox', { name: 'Link a data app' }),
        );

        expect(
            screen.queryByRole('option', { name: /Already linked/ }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('option', {
                name: 'Revenue dashboard · revenue-dashboard',
            }),
        );

        expect(mocks.link).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            appUuid: 'app-2',
            appName: 'Revenue dashboard',
            externalConnectionUuid: 'connection-uuid',
            connectionName: 'Example API',
        });
    });

    it('links an unlinked chart type from its tab', () => {
        mocks.projectChartTypes = [
            {
                appUuid: 'chart-type-1',
                name: 'Region map',
                slug: 'region-map',
            },
        ];
        renderWithRouter(
            <ConnectionUsageModal
                opened
                onClose={vi.fn()}
                projectUuid="project-uuid"
                connection={connection}
            />,
        );

        fireEvent.click(screen.getByRole('tab', { name: 'Chart types (0)' }));
        fireEvent.click(
            screen.getByRole('textbox', { name: 'Link a chart type' }),
        );
        fireEvent.click(
            screen.getByRole('option', {
                name: 'Region map · region-map',
            }),
        );

        expect(mocks.link).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            appUuid: 'chart-type-1',
            appName: 'Region map',
            externalConnectionUuid: 'connection-uuid',
            connectionName: 'Example API',
        });
    });
});

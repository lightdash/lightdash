import {
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
        expect(screen.getByText('No linked apps')).toBeInTheDocument();
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

    it('groups data apps and chart types with their destination links', () => {
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

        expect(screen.getByText('Data apps')).toBeInTheDocument();
        expect(screen.getByText('Chart types')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: /Revenue dashboard/ }),
        ).toHaveAttribute('href', '/projects/project-uuid/apps/app-1');
        expect(
            screen.getByRole('link', { name: /Region map/ }),
        ).toHaveAttribute(
            'href',
            '/projects/project-uuid/chart-types/chart-type-1',
        );
        expect(screen.queryByText(/Aliases?:/)).not.toBeInTheDocument();
    });
});

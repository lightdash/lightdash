import { type AiProjectContextEntry } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ContextCitation } from './ContextCitation';
import { MemoryCitation } from './MemoryCitation';

const { lightdashApiMock } = vi.hoisted(() => ({
    lightdashApiMock: vi.fn(),
}));

vi.mock('../../../../../api', () => ({ lightdashApi: lightdashApiMock }));

const entry: AiProjectContextEntry = {
    slug: 'revenue-net-a1b2c3d4',
    entryId: 'revenue-net',
    kind: 'definition',
    title: 'Revenue definition',
    apply: null,
    content: 'Revenue is net of refunds.',
    terms: ['revenue'],
    objects: [],
    status: 'active',
    citedCount: 3,
    generatedAt: '2026-08-01T00:00:00.000Z',
};

const mockApi = ({
    entryOverrides = {},
    memoryEnabled = true,
}: {
    entryOverrides?: Partial<AiProjectContextEntry>;
    memoryEnabled?: boolean;
} = {}) => {
    lightdashApiMock.mockImplementation(({ url }: { url: string }) => {
        if (url.includes('/aiProjectContextEntries/')) {
            return Promise.resolve({ ...entry, ...entryOverrides });
        }
        if (url.includes('/aiAgents/admin/settings')) {
            return Promise.resolve({ aiAgentMemoryEnabled: memoryEnabled });
        }
        if (url.includes('/feature-flag/')) {
            return Promise.resolve({ enabled: false });
        }
        return Promise.resolve(undefined);
    });
};

const renderInRoute = (ui: ReactElement) =>
    renderWithProviders(
        <MemoryRouter
            initialEntries={['/projects/project-1/ai-agents/agent-1']}
        >
            <Routes>
                <Route
                    path="/projects/:projectUuid/ai-agents/:agentUuid"
                    element={ui}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('ContextCitation', () => {
    beforeEach(() => {
        lightdashApiMock.mockReset();
    });

    it('shows the entry hover card on marker hover', async () => {
        mockApi();
        renderInRoute(
            <ContextCitation slug="revenue-net-a1b2c3d4" index={2} />,
        );

        const marker = screen.getByRole('button', {
            name: 'Show context entry revenue-net-a1b2c3d4',
        });
        expect(marker).toHaveTextContent('2');

        await userEvent.hover(marker);

        expect(
            await screen.findByText('Revenue definition'),
        ).toBeInTheDocument();
        expect(screen.getByText('Project context')).toBeInTheDocument();
        expect(screen.getByText('View entry')).toBeInTheDocument();
    });

    it('opens the details modal on marker click', async () => {
        mockApi();
        renderInRoute(
            <ContextCitation slug="revenue-net-a1b2c3d4" index={1} />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: /Show context entry/ }),
        );

        // Modal-only chrome: kind label + citations rail row.
        expect(await screen.findByText('Definition')).toBeInTheDocument();
        expect(screen.getByText('Citations')).toBeInTheDocument();
        expect(screen.getByText('revenue-net-a1b2c3d4')).toBeInTheDocument();
    });

    it('frames a removed entry with the tombstone callout, without provenance claims', async () => {
        mockApi({ entryOverrides: { status: 'removed' } });
        renderInRoute(
            <ContextCitation slug="revenue-net-a1b2c3d4" index={1} />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: /Show context entry/ }),
        );

        expect(
            await screen.findByText(
                'This entry is no longer in the project context',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/version the agent cited/),
        ).not.toBeInTheDocument();
    });
});

describe('MemoryCitation with memory disabled', () => {
    beforeEach(() => {
        lightdashApiMock.mockReset();
    });

    it('still renders interactive context citations', async () => {
        mockApi({ memoryEnabled: false });
        renderInRoute(
            <MemoryCitation
                id="revenue-net-a1b2c3d4"
                source="context"
                data-citation-index={3}
            />,
        );

        const marker = screen.getByRole('button', {
            name: /Show context entry/,
        });
        expect(marker).toHaveTextContent('3');

        await userEvent.hover(marker);
        expect(
            await screen.findByText('Revenue definition'),
        ).toBeInTheDocument();
    });

    it('renders memory citations as an inert marker', () => {
        mockApi({ memoryEnabled: false });
        renderInRoute(
            <MemoryCitation id="some-memory" data-citation-index={1} />,
        );

        expect(
            screen.queryByRole('button', { name: /Show memory/ }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
    });
});

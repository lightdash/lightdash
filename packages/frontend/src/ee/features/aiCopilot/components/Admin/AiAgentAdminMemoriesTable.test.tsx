import { type AiAgentAdminMemoryItem } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import AiAgentAdminMemoriesTable from './AiAgentAdminMemoriesTable';

const mockUseInfiniteAiAgentAdminMemories = vi.fn();

vi.mock('../../../../../hooks/useProjects', () => ({
    useProjects: () => ({ data: [] }),
}));

vi.mock('../../../../../hooks/useOrganizationUsers', () => ({
    useInfiniteOrganizationUsers: () => ({ data: undefined }),
}));

vi.mock('../../hooks/useAiAgentAdmin', () => ({
    useAiAgentAdminAgents: () => ({ data: [] }),
    useInfiniteAiAgentAdminMemories: (...args: unknown[]) =>
        mockUseInfiniteAiAgentAdminMemories(...args),
}));

const makeMemory = (
    overrides: Partial<AiAgentAdminMemoryItem> = {},
): AiAgentAdminMemoryItem => ({
    uuid: 'memory-1',
    slug: 'net-revenue-convention',
    title: 'Net revenue convention',
    summary: 'Use net revenue for every board report.',
    status: 'active',
    scope: 'user',
    project: { uuid: 'project-1', name: 'Jaffle shop' },
    agent: { uuid: 'agent-1', name: 'Ana', imageUrl: null },
    user: { uuid: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
    sourceThreadUuid: 'thread-1',
    citedCount: 2,
    lastCitedAt: '2026-07-22T12:00:00.000Z',
    pulledCount: 0,
    lastPulledAt: null,
    generatedAt: '2026-07-22T10:00:00.000Z',
    ...overrides,
});

const mockMemories = (memories: AiAgentAdminMemoryItem[]) => {
    mockUseInfiniteAiAgentAdminMemories.mockReturnValue({
        data: {
            pages: [
                {
                    data: { memories },
                    pagination: {
                        page: 1,
                        pageSize: 50,
                        totalPageCount: 1,
                        totalResults: memories.length,
                    },
                },
            ],
        },
        isInitialLoading: false,
        isFetching: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
    });
};

const renderTable = () =>
    renderWithProviders(
        <MemoryRouter initialEntries={['/generalSettings/ai/memories']}>
            <AiAgentAdminMemoriesTable />
        </MemoryRouter>,
    );

describe('AiAgentAdminMemoriesTable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders a scope badge on every row', () => {
        mockMemories([
            makeMemory(),
            makeMemory({
                uuid: 'memory-2',
                slug: 'fiscal-year-offset',
                title: 'Fiscal year offset',
                scope: 'project',
            }),
        ]);

        renderTable();

        const scopeColumnIndex = screen
            .getAllByRole('columnheader')
            .findIndex((header) => header.textContent?.includes('Scope'));
        expect(scopeColumnIndex).toBeGreaterThan(-1);

        const scopeCellText = (title: string) => {
            const row = screen.getByText(title).closest('tr');
            expect(row).not.toBeNull();
            return within(row!).getAllByRole('cell')[scopeColumnIndex]
                .textContent;
        };

        expect(scopeCellText('Net revenue convention')).toBe('Personal');
        expect(scopeCellText('Fiscal year offset')).toBe('Project-wide');
    });

    it('filters by scope through the scope facet', async () => {
        const user = userEvent.setup();
        mockMemories([makeMemory()]);

        renderTable();

        await user.click(screen.getByRole('button', { name: /Scope/ }));
        await user.click(await screen.findByText('Project-wide'));

        expect(mockUseInfiniteAiAgentAdminMemories).toHaveBeenLastCalledWith(
            expect.objectContaining({
                filters: expect.objectContaining({ scopes: ['project'] }),
            }),
            expect.anything(),
        );
    });
});

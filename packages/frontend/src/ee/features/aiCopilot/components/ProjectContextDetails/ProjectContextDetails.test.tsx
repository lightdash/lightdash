import type { AiProjectContextEntryDetail } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { ProjectContextDetails } from './ProjectContextDetails';

const entry = (
    overrides: Partial<AiProjectContextEntryDetail> = {},
): AiProjectContextEntryDetail => ({
    slug: 'revenue-definition-3fa9c2d1',
    id: 'revenue-definition',
    title: null,
    content: 'Revenue excludes refunds.',
    apply: null,
    kind: 'definition',
    status: 'active',
    citedCount: 4,
    terms: ['revenue'],
    objects: [{ type: 'explore', name: 'orders' }],
    generatedAt: '2026-01-01T00:00:00.000Z',
    successorSlug: null,
    ...overrides,
});

const renderDetails = (
    detail: AiProjectContextEntryDetail,
    onOpenSuccessor = vi.fn(),
) => {
    renderWithProviders(
        <MemoryRouter>
            <ProjectContextDetails
                entry={detail}
                projectUuid="project-1"
                onOpenSuccessor={onOpenSuccessor}
            />
        </MemoryRouter>,
    );
    return onOpenSuccessor;
};

describe('ProjectContextDetails', () => {
    it('renders what the entry has', () => {
        renderDetails(entry());

        expect(screen.getByText('Revenue excludes refunds.')).toBeDefined();
        expect(screen.getByText('Definition')).toBeDefined();
        expect(screen.getByText('revenue-definition-3fa9c2d1')).toBeDefined();
        expect(screen.getByText('revenue')).toBeDefined();
        expect(screen.getByText('orders')).toBeDefined();
        expect(screen.queryByText(/no longer in the project context/i)).toBe(
            null,
        );
    });

    it('renders the optional apply note only when present', () => {
        renderDetails(
            entry({ apply: 'Use when a question mentions revenue.' }),
        );

        expect(
            screen.getByText('Use when a question mentions revenue.'),
        ).toBeDefined();
    });

    it('flags a tombstoned entry and offers its successor', async () => {
        const onOpenSuccessor = renderDetails(
            entry({
                status: 'removed',
                successorSlug: 'revenue-definition-aa11bb22',
            }),
        );

        expect(
            screen.getByText(/no longer in the project context/i),
        ).toBeDefined();

        await userEvent.click(
            screen.getByRole('button', { name: /view the current entry/i }),
        );
        expect(onOpenSuccessor).toHaveBeenCalledWith(
            'revenue-definition-aa11bb22',
        );
    });

    it('omits the successor link when the lineage chain ends', () => {
        renderDetails(entry({ status: 'removed', successorSlug: null }));

        expect(
            screen.getByText(/no longer in the project context/i),
        ).toBeDefined();
        expect(
            screen.queryByRole('button', { name: /view the current entry/i }),
        ).toBe(null);
    });
});

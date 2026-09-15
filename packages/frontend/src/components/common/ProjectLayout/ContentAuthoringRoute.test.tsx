import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentAuthoringRoute } from './ContentAuthoringRoute';

const renderRoute = (path: string, width: number) => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
        const minWidth = query.match(/min-width:\s*([\d.]+)(em|px)/);
        return {
            matches: minWidth
                ? width >= Number(minWidth[1]) * (minWidth[2] === 'em' ? 16 : 1)
                : false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };
    });
    return render(
        <MantineProvider>
            <MemoryRouter initialEntries={[`/projects/jaffle-shop/${path}`]}>
                <ContentAuthoringRoute>
                    <div>Route content</div>
                </ContentAuthoringRoute>
            </MemoryRouter>
        </MantineProvider>,
    );
};

afterEach(() => vi.restoreAllMocks());

const editorPaths = [
    'tables',
    'tables/orders',
    'saved/revenue/edit',
    'dashboards/revenue/edit',
    'dashboards/revenue/edit/overview',
    'sql-runner',
    'sql-runner/revenue/edit',
];

describe('content authoring viewport policy', () => {
    it.each(editorPaths)('blocks %s below 768px', (path) => {
        renderRoute(path, 767);
        expect(screen.getByText('Open this editor on desktop')).toBeVisible();
        expect(screen.queryByText('Route content')).not.toBeInTheDocument();
    });

    it.each(editorPaths)('allows %s at 768px', (path) => {
        renderRoute(path, 768);
        expect(screen.getByText('Route content')).toBeVisible();
        expect(
            screen.queryByText('Open this editor on desktop'),
        ).not.toBeInTheDocument();
    });

    it.each([
        'saved/revenue',
        'saved/revenue/view',
        'dashboards/revenue/view',
        'sql-runner/revenue',
    ])('keeps the %s viewer available on a phone', (path) => {
        renderRoute(path, 390);
        expect(screen.getByText('Route content')).toBeVisible();
    });
});

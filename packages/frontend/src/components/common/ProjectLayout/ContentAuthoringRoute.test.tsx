import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentAuthoringRoute } from './ContentAuthoringRoute';

const { device } = vi.hoisted(() => ({ device: { isPhone: false } }));

vi.mock('../../../hooks/useIsPhoneDevice', () => ({
    useIsPhoneDevice: () => device.isPhone,
}));

const renderRoute = (path: string, width: number, isPhone = false) => {
    device.isPhone = isPhone;
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

afterEach(() => {
    device.isPhone = false;
    vi.restoreAllMocks();
});

const editorPaths = [
    'tables',
    'tables/orders',
    'saved/revenue/edit',
    'dashboards/revenue/edit',
    'dashboards/revenue/edit/overview',
    'sql-runner',
    'sql-runner/revenue/edit',
];

describe('content authoring device policy', () => {
    it.each(editorPaths)(
        'keeps %s available in a narrow desktop window',
        (path) => {
            renderRoute(path, 767);
            expect(screen.getByText('Route content')).toBeVisible();
        },
    );

    it.each(editorPaths)('blocks %s on phones at any width', (path) => {
        renderRoute(path, 1024, true);
        expect(
            screen.getByText('Editing isn’t available on phones'),
        ).toBeVisible();
        expect(screen.queryByText('Route content')).not.toBeInTheDocument();
    });

    it.each([
        'saved/revenue',
        'saved/revenue/view',
        'dashboards/revenue/view',
        'sql-runner/revenue',
    ])('keeps the %s viewer available on phones', (path) => {
        renderRoute(path, 390, true);
        expect(screen.getByText('Route content')).toBeVisible();
    });
});

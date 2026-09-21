import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ChartTypeBuilderHeader from './ChartTypeBuilderHeader';

const baseProps = {
    projectUuid: 'project-1',
    backLink: { label: 'Chart types', to: '/projects/project-1/chart-types' },
    onBackLinkClick: vi.fn(),
    app: null,
    hasHistory: false,
    isHistoryOpen: false,
    isBuilding: false,
    upgrade: null,
    onUpgradeStarted: vi.fn(),
    onToggleHistory: vi.fn(),
    onDone: vi.fn(),
    onUseInExplorer: null,
    useInExplorerDisabledReason: null,
};

const renderHeader = (
    overrides: Partial<
        React.ComponentProps<typeof ChartTypeBuilderHeader>
    > = {},
) =>
    renderWithProviders(
        <MemoryRouter>
            <ChartTypeBuilderHeader
                {...baseProps}
                latestReadyVersion={null}
                useInExplorerLink={null}
                {...overrides}
            />
        </MemoryRouter>,
    );

/** Mantine only stamps `data-variant` for a non-default variant, so a missing
 *  attribute is the filled (implicit default) button. */
const expectDoneIsSecondary = () =>
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute(
        'data-variant',
        'default',
    );

describe('ChartTypeBuilderHeader', () => {
    it('skips the back link cleanup on a click that opens a new tab', () => {
        const onBackLinkClick = vi.fn();
        renderHeader({ onBackLinkClick });
        const backLink = screen.getByRole('link', { name: 'Chart types' });

        // A modified click is the browser's own "open in a new tab", which
        // react-router deliberately lets through; jsdom cannot navigate, so
        // the default action is stopped here rather than logged.
        const modified = (modifier: Partial<MouseEventInit>) => {
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                ...modifier,
            });
            event.preventDefault();
            fireEvent(backLink, event);
        };
        modified({ metaKey: true });
        modified({ ctrlKey: true });
        modified({ shiftKey: true });
        expect(onBackLinkClick).not.toHaveBeenCalled();

        fireEvent.click(backLink);
        expect(onBackLinkClick).toHaveBeenCalledTimes(1);
    });

    it('makes Done the filled action before Use in Explorer is on offer', () => {
        renderHeader({ latestReadyVersion: null });

        expect(screen.queryByText('Use in Explorer')).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Done' }),
        ).not.toHaveAttribute('data-variant');
    });

    it('makes Done a secondary action once Use in Explorer is on offer', () => {
        const onUseInExplorer = vi.fn();
        renderHeader({
            latestReadyVersion: 1,
            useInExplorerLink: '/projects/project-1/tables/orders',
            onUseInExplorer,
        });

        const link = screen.getByRole('link', { name: 'Use in Explorer' });
        expect(link).toHaveAttribute(
            'href',
            '/projects/project-1/tables/orders',
        );
        expectDoneIsSecondary();

        fireEvent.click(link);
        expect(onUseInExplorer).toHaveBeenCalledTimes(1);
    });

    it('offers the table picker when there is no query to carry', () => {
        const onUseInExplorer = vi.fn();
        renderHeader({ latestReadyVersion: 1, onUseInExplorer });

        expect(screen.queryByRole('link', { name: 'Use in Explorer' })).toBe(
            null,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Use in Explorer' }),
        );
        expect(onUseInExplorer).toHaveBeenCalledTimes(1);
        expectDoneIsSecondary();
    });

    it('keeps the action visible but inert while it cannot run', () => {
        const onUseInExplorer = vi.fn();
        renderHeader({
            latestReadyVersion: 1,
            useInExplorerLink: '/projects/project-1/tables/orders',
            onUseInExplorer,
            useInExplorerDisabledReason:
                'Switch to the latest version to use it in Explorer',
        });

        const action = screen.getByRole('button', { name: 'Use in Explorer' });
        expect(action).toHaveAttribute('aria-disabled', 'true');
        expect(screen.queryByRole('link', { name: 'Use in Explorer' })).toBe(
            null,
        );

        fireEvent.click(action);
        expect(onUseInExplorer).not.toHaveBeenCalled();
        // A disabled primary is still the primary: Done stays secondary.
        expectDoneIsSecondary();
    });

    it('says why the action cannot run', async () => {
        renderHeader({
            latestReadyVersion: 1,
            useInExplorerDisabledReason:
                'Switch to the latest version to use it in Explorer',
        });

        fireEvent.mouseEnter(
            screen.getByRole('button', { name: 'Use in Explorer' }),
        );

        expect(
            await screen.findByText(
                'Switch to the latest version to use it in Explorer',
            ),
        ).toBeInTheDocument();
    });
});

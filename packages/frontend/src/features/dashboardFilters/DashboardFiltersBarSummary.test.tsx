import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DashboardFiltersBarSummary } from './DashboardFiltersBarSummary';

// One line, its counts in their own spans
const summary = () =>
    screen.getByText(
        (_, element) =>
            element?.tagName === 'P' &&
            /^2 filters/.test(element.textContent ?? ''),
    );

describe('DashboardFiltersBarSummary', () => {
    it('counts named date zooms after filters and parameters', () => {
        renderWithProviders(
            <DashboardFiltersBarSummary
                filtersCount={2}
                parametersCount={0}
                dateZoomsCount={1}
                dateZoomLabel="Default"
                onExpand={vi.fn()}
            />,
        );
        expect(summary()).toHaveTextContent(
            /^2 filters · 1 date zoom · Date Zoom: Default$/,
        );
    });

    it('reads as shipped without named date zooms', () => {
        renderWithProviders(
            <DashboardFiltersBarSummary
                filtersCount={2}
                parametersCount={1}
                dateZoomLabel="Default"
                onExpand={vi.fn()}
            />,
        );
        expect(summary()).toHaveTextContent(
            /^2 filters · 1 parameter · Date Zoom: Default$/,
        );
    });
});

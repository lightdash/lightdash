import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalTargetContext } from '../../../providers/PortalTarget/PortalTargetContext';
import { renderWithProviders } from '../../../testing/testUtils';
import { MetricCatalogColumnHeaderCell } from './MetricCatalogColumnHeaderCell';

const Icon = () => <svg />;

describe('MetricCatalogColumnHeaderCell', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the header tooltip inside the portal target', () => {
        const portal = document.createElement('div');
        portal.id = 'sdk-portal';
        document.body.appendChild(portal);

        renderWithProviders(
            <PortalTargetContext.Provider value="#sdk-portal">
                <MetricCatalogColumnHeaderCell
                    Icon={Icon}
                    tooltipLabel="Grouping of the metric"
                >
                    Category
                </MetricCatalogColumnHeaderCell>
            </PortalTargetContext.Provider>,
        );

        fireEvent.mouseEnter(screen.getByText('Category').parentElement!);

        expect(portal).toContainElement(
            screen.getByText('Grouping of the metric'),
        );
    });

    it('falls back to the document body without a portal target', () => {
        renderWithProviders(
            <MetricCatalogColumnHeaderCell
                Icon={Icon}
                tooltipLabel="Grouping of the metric"
            >
                Category
            </MetricCatalogColumnHeaderCell>,
        );

        fireEvent.mouseEnter(screen.getByText('Category').parentElement!);

        expect(screen.getByText('Grouping of the metric').parentElement).toBe(
            document.body,
        );
    });
});

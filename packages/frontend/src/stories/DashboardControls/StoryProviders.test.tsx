import { screen } from '@testing-library/react';
import { type FC } from 'react';
import { describe, expect, it } from 'vitest';
import {
    selectControlSections,
    selectDashboardTiles,
    useDashboardSelector,
} from '../../features/dashboard/store';
import { renderWithProviders } from '../../testing/testUtils';
import { sections, tiles } from './fixtures';
import { StoryFrame } from './StoryProviders';

// Reads what the frame's store holds, as the shipped components read it
const StoreProbe: FC = () => {
    const storeTiles = useDashboardSelector(selectDashboardTiles);
    const storeSections = useDashboardSelector(selectControlSections);
    return (
        <>
            <span data-testid="tiles">{storeTiles?.length ?? 'none'}</span>
            <span data-testid="sections">
                {storeSections.map(({ name }) => name).join(',')}
            </span>
        </>
    );
};

describe('StoryFrame', () => {
    it('seeds the dashboard tiles into the store', () => {
        renderWithProviders(
            <StoryFrame
                startOfWeek={null}
                sections={sections}
                hasParameters
                isManyFields={false}
                dateZoom={{}}
            >
                <StoreProbe />
            </StoryFrame>,
        );
        expect(screen.getByTestId('tiles')).toHaveTextContent(
            String(tiles.length),
        );
    });

    it('rebuilds the store when the sections change', () => {
        const { rerender } = renderWithProviders(
            <StoryFrame
                startOfWeek={null}
                sections={sections}
                hasParameters
                isManyFields={false}
                dateZoom={{}}
            >
                <StoreProbe />
            </StoryFrame>,
        );
        expect(screen.getByTestId('sections')).toHaveTextContent(
            'Customers,Orders',
        );
        rerender(
            <StoryFrame
                startOfWeek={null}
                sections={[]}
                hasParameters
                isManyFields={false}
                dateZoom={{}}
            >
                <StoreProbe />
            </StoryFrame>,
        );
        expect(screen.getByTestId('sections')).toBeEmptyDOMElement();
    });
});

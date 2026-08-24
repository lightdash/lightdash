import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ColorPaletteSection } from './ColorPaletteSection';

vi.mock('../../../features/explorer/store', () => ({
    useExplorerDispatch: () => vi.fn(),
    useExplorerSelector: (selector: () => unknown) => selector(),
    selectSavedChart: () => null,
    selectUnsavedColorPaletteUuid: () => null,
}));

vi.mock('../../../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
}));

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: { appearance: { overrideColorPalette: null } } }),
}));

vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        pivotDimensions: undefined,
        itemsMap: undefined,
    }),
}));

describe('ColorPaletteSection', () => {
    it('heads the picker with a section heading in the section variant', () => {
        renderWithProviders(<ColorPaletteSection variant="section" />);

        // The heading names the section; the input itself carries no label.
        expect(screen.getByText('Color palette')).toBeInTheDocument();
        expect(
            screen.queryByRole('textbox', { name: 'Color palette' }),
        ).not.toBeInTheDocument();
    });

    it('labels the input itself in the field variant', () => {
        renderWithProviders(<ColorPaletteSection variant="field" />);

        expect(
            screen.getByRole('textbox', { name: 'Color palette' }),
        ).toBeInTheDocument();
    });
});

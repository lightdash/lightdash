import { type DataAppVizSchema } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type VizContractDiff } from '../utils/vizContractDiff';
import ConfigureDrawer from './ConfigureDrawer';

vi.mock('../../../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
}));

const schema: DataAppVizSchema = {
    fields: [],
    configOptions: [
        { name: 'grid', label: 'Show grid', type: 'boolean', default: true },
        {
            name: 'markers',
            label: 'Show markers',
            type: 'boolean',
            default: false,
        },
    ],
    colorPalette: null,
};

const diff: VizContractDiff = {
    fromVersion: 3,
    toVersion: 4,
    added: ['markers'],
    changed: {
        grid: {
            name: 'grid',
            label: 'Show grid',
            type: 'boolean',
            default: false,
        },
    },
    removed: [
        {
            name: 'legend',
            label: 'Legend',
            type: 'select',
            choices: [{ value: 'right', label: 'Right' }],
            default: 'right',
        },
    ],
};

const renderDrawer = (
    props: Partial<React.ComponentProps<typeof ConfigureDrawer>> = {},
) =>
    renderWithProviders(
        <ConfigureDrawer
            opened
            onOpenChange={vi.fn()}
            schema={schema}
            isBuilding={false}
            contractDiff={null}
            optionValues={{}}
            onOptionChange={vi.fn()}
            colorPaletteUuid={null}
            onPaletteChange={vi.fn()}
            {...props}
        />,
    );

describe('ConfigureDrawer', () => {
    it('pulses a syncing badge while a build runs', () => {
        renderDrawer({ isBuilding: true });

        expect(screen.getByText('syncing…')).toBeInTheDocument();
    });

    it('summarises and annotates what the last build changed', () => {
        renderDrawer({ contractDiff: diff });

        expect(screen.getByText('v3 → v4 · 3 changes')).toBeInTheDocument();
        expect(screen.getByText('New in v4')).toBeInTheDocument();
        expect(screen.getByText('Off')).toBeInTheDocument();
        expect(
            screen.getByText(/No longer declared: Legend/),
        ).toBeInTheDocument();
    });

    it('clears an annotation once its control is touched', () => {
        renderDrawer({ contractDiff: diff });

        fireEvent.click(screen.getByLabelText('Show grid'));

        expect(screen.queryByText('Off')).not.toBeInTheDocument();
        expect(screen.getByText('New in v4')).toBeInTheDocument();
    });

    it('collapses a section that carries no changes', () => {
        renderDrawer();

        expect(screen.getByLabelText('Show grid')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Display'));

        expect(screen.queryByLabelText('Show grid')).not.toBeInTheDocument();
    });
});

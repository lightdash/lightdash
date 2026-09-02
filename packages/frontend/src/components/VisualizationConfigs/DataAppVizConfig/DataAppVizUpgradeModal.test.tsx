import { type DataAppVizSchemaChanges } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizUpgradeModal from './DataAppVizUpgradeModal';

const noChanges: DataAppVizSchemaChanges = {
    fields: { added: [], removed: [], changed: [] },
    configOptions: { added: [], removed: [], changed: [] },
    colorPalette: 'unchanged',
};

const changes: DataAppVizSchemaChanges = {
    ...noChanges,
    fields: {
        added: [
            {
                name: 'target',
                label: 'Target',
                type: 'metric',
                required: false,
            },
        ],
        removed: [],
        changed: [],
    },
};

const renderModal = (
    schemaChanges: DataAppVizSchemaChanges,
    onUpgrade: () => void = vi.fn(),
) =>
    renderWithProviders(
        <DataAppVizUpgradeModal
            typeName="Radial gauge"
            changes={schemaChanges}
            onClose={vi.fn()}
            onUpgrade={onUpgrade}
        />,
    );

describe('DataAppVizUpgradeModal', () => {
    it('names the type and lists the changes', () => {
        renderModal(changes);

        expect(screen.getByText('Radial gauge')).toBeInTheDocument();
        expect(screen.getByText('Added')).toBeInTheDocument();
        expect(screen.getByText('Target')).toBeInTheDocument();
    });

    it('warns when the upgrade drops fields or options', () => {
        renderModal({
            ...noChanges,
            configOptions: {
                added: [],
                removed: [
                    {
                        type: 'boolean',
                        name: 'legacy',
                        label: 'Legacy',
                        default: false,
                    },
                ],
                changed: [],
            },
        });

        expect(
            screen.getByText(/Removed fields lose their mapping/),
        ).toBeInTheDocument();
    });

    it('does not warn when nothing is removed', () => {
        renderModal(changes);

        expect(
            screen.queryByText(/Removed fields lose their mapping/),
        ).not.toBeInTheDocument();
    });

    it('says so when only the rendering changed', () => {
        renderModal(noChanges);

        expect(
            screen.getByText(/only the rendering changed/),
        ).toBeInTheDocument();
    });

    it('upgrades from the footer', () => {
        const onUpgrade = vi.fn();
        renderModal(changes, onUpgrade);

        fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

        expect(onUpgrade).toHaveBeenCalledTimes(1);
    });
});

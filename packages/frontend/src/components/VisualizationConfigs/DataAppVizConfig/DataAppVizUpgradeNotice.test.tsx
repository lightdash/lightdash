import { type DataAppVizSchemaChanges } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizUpgradeNotice from './DataAppVizUpgradeNotice';

vi.mock('./DataAppVizUpgradeModal', () => ({
    default: ({
        typeName,
        onClose,
        onUpgrade,
    }: {
        typeName: string;
        onClose: () => void;
        onUpgrade: () => void;
    }) => (
        <div data-testid="upgrade-modal">
            {typeName}
            <button type="button" onClick={onClose}>
                close
            </button>
            <button type="button" onClick={onUpgrade}>
                upgrade
            </button>
        </div>
    ),
}));

const changes: DataAppVizSchemaChanges = {
    fields: { added: [], removed: [], changed: [] },
    configOptions: { added: [], removed: [], changed: [] },
    colorPalette: 'unchanged',
};

const renderNotice = (onUpgrade: () => void = vi.fn()) =>
    renderWithProviders(
        <DataAppVizUpgradeNotice
            typeName="Radial gauge"
            changes={changes}
            onUpgrade={onUpgrade}
        />,
    );

describe('DataAppVizUpgradeNotice', () => {
    it('announces the newer version and opens the review on demand', () => {
        renderNotice();

        expect(screen.getByText('Newer version available')).toBeInTheDocument();
        expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Review upgrade' }));

        expect(screen.getByTestId('upgrade-modal')).toHaveTextContent(
            'Radial gauge',
        );

        fireEvent.click(screen.getByRole('button', { name: 'close' }));

        expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
    });

    it('upgrades from the review and closes it', () => {
        const onUpgrade = vi.fn();
        renderNotice(onUpgrade);

        fireEvent.click(screen.getByRole('button', { name: 'Review upgrade' }));
        fireEvent.click(screen.getByRole('button', { name: 'upgrade' }));

        expect(onUpgrade).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
    });
});

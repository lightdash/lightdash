import { type DataAppVizSchemaChanges } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizUpgradeNotice from './DataAppVizUpgradeNotice';

vi.mock('./DataAppVizUpgradeModal', () => ({
    default: ({
        typeName,
        onClose,
    }: {
        typeName: string;
        onClose: () => void;
    }) => (
        <div data-testid="upgrade-modal">
            {typeName}
            <button type="button" onClick={onClose}>
                close
            </button>
        </div>
    ),
}));

const changes: DataAppVizSchemaChanges = {
    fields: { added: [], removed: [], changed: [] },
    configOptions: { added: [], removed: [], changed: [] },
    colorPalette: 'unchanged',
};

describe('DataAppVizUpgradeNotice', () => {
    it('announces the newer version and opens the review on demand', () => {
        renderWithProviders(
            <DataAppVizUpgradeNotice
                typeName="Radial gauge"
                changes={changes}
            />,
        );

        expect(screen.getByText('Newer version available')).toBeInTheDocument();
        expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Review upgrade' }));

        expect(screen.getByTestId('upgrade-modal')).toHaveTextContent(
            'Radial gauge',
        );

        fireEvent.click(screen.getByRole('button', { name: 'close' }));

        expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
    });
});

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { JsonCellModal } from './JsonCellViewer';

describe('JsonCellModal', () => {
    it('shows the JSON path of the clicked node', async () => {
        renderWithProviders(
            <JsonCellModal
                value={{ id: 7, user: { name: 'Ada' }, 'user.name': 'dotted' }}
                opened
                onClose={() => {}}
            />,
        );

        expect(await screen.findByText('$')).toBeInTheDocument();
        expect(screen.queryByText('"Ada"')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('7'));
        expect(screen.getByText('$.id')).toBeInTheDocument();

        fireEvent.click(screen.getByText('user:'));
        expect(screen.getByText('$.user')).toBeInTheDocument();

        fireEvent.click(await screen.findByText('"Ada"'));
        expect(screen.getByText('$.user.name')).toBeInTheDocument();
        expect(screen.getByText('"dotted"')).toBeInTheDocument();
    });
});

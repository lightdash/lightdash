import { type DataAppVizSchema } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizResultCard from './DataAppVizResultCard';

const schema: DataAppVizSchema = {
    fields: [
        { name: 'source', label: 'Source', type: 'dimension', required: true },
        { name: 'value', label: 'Value', type: 'metric', required: false },
    ],
    configOptions: [],
};

describe('DataAppVizResultCard', () => {
    it('renders each declared field with its label and type badge', () => {
        renderWithProviders(<DataAppVizResultCard schema={schema} />);

        expect(screen.getByText('Source')).toBeInTheDocument();
        expect(screen.getByText('Value')).toBeInTheDocument();
        expect(screen.getByText(/dimension/i)).toBeInTheDocument();
        expect(screen.getByText(/metric/i)).toBeInTheDocument();
    });

    it('does not badge required state on the card', () => {
        renderWithProviders(<DataAppVizResultCard schema={schema} />);

        expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it('renders gracefully with an empty fields array', () => {
        renderWithProviders(
            <DataAppVizResultCard schema={{ fields: [], configOptions: [] }} />,
        );

        expect(screen.getByText(/0 fields to map/i)).toBeInTheDocument();
    });
});

import { type DataAppVizSchemaChanges } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import VizSchemaChangesList from './VizSchemaChangesList';

const changes: DataAppVizSchemaChanges = {
    fields: {
        added: [
            {
                name: 'target',
                label: 'Target',
                type: 'metric',
                required: false,
            },
        ],
        removed: [
            {
                name: 'series',
                label: 'Series',
                type: 'series',
                required: false,
            },
        ],
        changed: [
            {
                before: {
                    name: 'value',
                    label: 'Value',
                    type: 'metric',
                    required: false,
                },
                after: {
                    name: 'value',
                    label: 'Value',
                    type: 'metric',
                    required: true,
                },
            },
        ],
    },
    configOptions: {
        added: [],
        removed: [],
        changed: [
            {
                before: {
                    type: 'select',
                    name: 'mode',
                    label: 'Mode',
                    choices: [
                        { value: 'stacked', label: 'Stacked' },
                        { value: 'grouped', label: 'Grouped' },
                    ],
                    default: 'stacked',
                },
                after: {
                    type: 'select',
                    name: 'mode',
                    label: 'Mode',
                    choices: [{ value: 'stacked', label: 'Stacked' }],
                    default: 'stacked',
                },
            },
        ],
    },
    colorPalette: 'added',
};

describe('VizSchemaChangesList', () => {
    it('groups deltas by kind and describes each in plain words', () => {
        renderWithProviders(<VizSchemaChangesList changes={changes} />);

        const headings = screen
            .getAllByText(/^(Added|Updated|Removed)$/)
            .map((el) => el.textContent);
        expect(headings).toEqual(['Added', 'Updated', 'Removed']);
        expect(screen.getByText('Target')).toBeInTheDocument();
        expect(screen.getByText('metric field')).toBeInTheDocument();
        expect(screen.getByText('now required')).toBeInTheDocument();
        expect(screen.getByText('drops grouped')).toBeInTheDocument();
        expect(screen.getByText('Series')).toBeInTheDocument();
        expect(screen.getByText('Color palette')).toBeInTheDocument();
    });

    it('omits groups without changes', () => {
        renderWithProviders(
            <VizSchemaChangesList
                changes={{
                    fields: { added: [], removed: [], changed: [] },
                    configOptions: changes.configOptions,
                    colorPalette: 'unchanged',
                }}
            />,
        );

        expect(screen.queryByText('Added')).not.toBeInTheDocument();
        expect(screen.queryByText('Removed')).not.toBeInTheDocument();
        expect(screen.getByText('Updated')).toBeInTheDocument();
    });
});

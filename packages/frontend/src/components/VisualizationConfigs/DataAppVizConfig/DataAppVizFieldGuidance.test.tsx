import { type DataAppVizField } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizFieldGuidance from './DataAppVizFieldGuidance';

const field: DataAppVizField = {
    name: 'stage',
    label: 'Stage',
    type: 'dimension',
    required: true,
};

describe('DataAppVizFieldGuidance', () => {
    it.each(['', '   '])(
        'uses the field type guidance when the stored description is blank (%j)',
        (description) => {
            renderWithProviders(
                <DataAppVizFieldGuidance
                    field={{ ...field, description }}
                    showMappingHint
                />,
            );

            expect(
                screen.getByText(
                    'Choose the category or label that identifies each row.',
                ),
            ).toBeInTheDocument();
            expect(
                screen.getByText('Map this required field to continue.'),
            ).toBeInTheDocument();
        },
    );

    it('preserves scalar examples and hides an empty examples list', () => {
        const { rerender } = renderWithProviders(
            <DataAppVizFieldGuidance
                field={{ ...field, examples: [0, false, null] }}
            />,
        );

        expect(
            screen.getByText('Examples: 0, false, null'),
        ).toBeInTheDocument();

        rerender(
            <DataAppVizFieldGuidance field={{ ...field, examples: [] }} />,
        );

        expect(screen.queryByText(/^Examples:/)).not.toBeInTheDocument();
    });
});

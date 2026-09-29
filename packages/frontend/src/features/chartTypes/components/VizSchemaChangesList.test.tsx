import {
    type DataAppVizConfigOption,
    type DataAppVizSchemaChanges,
} from '@lightdash/common';
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
    hierarchy: 'added',
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
        expect(screen.getByText('Hierarchy')).toBeInTheDocument();
    });

    it.each([
        ['added', 'Added', null],
        ['changed', 'Updated', 'field changed'],
        ['removed', 'Removed', null],
    ] as const)(
        'lists a hierarchy that was %s',
        (hierarchy, heading, detail) => {
            renderWithProviders(
                <VizSchemaChangesList
                    changes={{
                        fields: { added: [], removed: [], changed: [] },
                        configOptions: { added: [], removed: [], changed: [] },
                        colorPalette: 'unchanged',
                        hierarchy,
                    }}
                />,
            );

            expect(screen.getByText(heading)).toBeInTheDocument();
            expect(screen.getByText('Hierarchy')).toBeInTheDocument();
            if (detail) expect(screen.getByText(detail)).toBeInTheDocument();
        },
    );

    it('omits groups without changes', () => {
        renderWithProviders(
            <VizSchemaChangesList
                changes={{
                    fields: { added: [], removed: [], changed: [] },
                    configOptions: changes.configOptions,
                    colorPalette: 'unchanged',
                    hierarchy: 'unchanged',
                }}
            />,
        );

        expect(screen.queryByText('Added')).not.toBeInTheDocument();
        expect(screen.queryByText('Removed')).not.toBeInTheDocument();
        expect(screen.getByText('Updated')).toBeInTheDocument();
    });
});

it.each([
    [undefined, false, 'bounds hidden'],
    [false, true, 'bounds shown'],
] as const)(
    'describes gradient visibility changes without unchanged defaults',
    (beforeBounds, afterBounds, detail) => {
        const before: DataAppVizConfigOption = {
            type: 'gradient',
            name: 'fill',
            label: 'Fill',
            showBounds: beforeBounds,
            default: { colors: ['#000', '#fff'], min: 0, max: 100 },
        };
        const after: DataAppVizConfigOption = {
            ...before,
            showBounds: afterBounds,
            default: JSON.parse(JSON.stringify(before.default)),
        };
        renderWithProviders(
            <VizSchemaChangesList
                changes={{
                    fields: { added: [], removed: [], changed: [] },
                    configOptions: {
                        added: [],
                        removed: [],
                        changed: [{ before, after }],
                    },
                    colorPalette: 'unchanged',
                    hierarchy: 'unchanged',
                }}
            />,
        );
        expect(screen.getByText(detail)).toBeInTheDocument();
        expect(screen.queryByText(/default/)).not.toBeInTheDocument();
    },
);

it('still describes changed gradient defaults', () => {
    const before: DataAppVizConfigOption = {
        type: 'gradient',
        name: 'fill',
        label: 'Fill',
        default: { colors: ['#000', '#fff'], min: 0, max: 100 },
    };
    const after: DataAppVizConfigOption = {
        ...before,
        showBounds: true,
        default: { ...before.default, max: 200 },
    };
    renderWithProviders(
        <VizSchemaChangesList
            changes={{
                fields: { added: [], removed: [], changed: [] },
                configOptions: {
                    added: [],
                    removed: [],
                    changed: [{ before, after }],
                },
                colorPalette: 'unchanged',
                hierarchy: 'unchanged',
            }}
        />,
    );
    expect(
        screen.getByText(
            'default #000, #fff (0 to 100) → #000, #fff (0 to 200)',
        ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bounds shown/)).not.toBeInTheDocument();
});

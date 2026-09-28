import {
    FieldType,
    MetricType,
    getDataAppVizFieldIds,
    type CompiledMetric,
    type DataAppVizField,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reconcileDataAppVizFieldMapping } from '../../../features/chartTypes/utils/autoMapDataAppVizFields';
import useDataAppVizVisualizationConfig from '../../../hooks/useDataAppVizVisualizationConfig';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizFieldOptions from './DataAppVizFieldOptions';

const field: DataAppVizField = {
    name: 'values',
    label: 'Metrics',
    type: 'metric',
    required: true,
    multiple: true,
    configOptions: [
        { name: 'label', label: 'Label', type: 'text', default: 'Default' },
    ],
};

const metric = (name: string): CompiledMetric => ({
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    sql: '',
    compiledSql: '',
    tablesReferences: [],
    hidden: false,
});

const FieldOptionsHarness = () => {
    const [hasTotal, setHasTotal] = useState(true);
    const [isOpen, setIsOpen] = useState(true);
    const { validConfig, setField, setFieldOption } =
        useDataAppVizVisualizationConfig(
            {
                dataAppVizUuid: 'viz-1',
                fieldMapping: { values: ['orders_total'] },
                fieldOptionValues: {},
            },
            undefined,
            new Set(
                hasTotal ? ['orders_total', 'orders_count'] : ['orders_count'],
            ),
        );

    const bindings = reconcileDataAppVizFieldMapping(
        [field],
        {
            ...(hasTotal ? { orders_total: metric('total') } : {}),
            orders_count: metric('count'),
        },
        validConfig?.fieldMapping ?? {},
    );
    return (
        <>
            <Button onClick={() => setField('values', [])}>Remove field</Button>
            <Button onClick={() => setField('values', ['orders_total'])}>
                Add field
            </Button>
            <Button onClick={() => setHasTotal(false)}>
                Remove total from query
            </Button>
            <Button onClick={() => setHasTotal(true)}>
                Add total to query
            </Button>
            <Button onClick={() => setIsOpen(!isOpen)}>Toggle panel</Button>
            {isOpen && (
                <DataAppVizFieldOptions
                    field={field}
                    group={null}
                    fieldIds={getDataAppVizFieldIds(bindings.values)}
                    getFieldLabel={(fieldId) => fieldId}
                    values={validConfig?.fieldOptionValues.values ?? {}}
                    colorPalette={[]}
                    onChange={(fieldId, name, value) =>
                        setFieldOption('viz-1', 'values', fieldId, name, value)
                    }
                />
            )}
        </>
    );
};

describe('DataAppVizFieldOptions', () => {
    afterEach(() => vi.useRealTimers());

    it('drops pending edits when their field is removed', () => {
        vi.useFakeTimers();
        renderWithProviders(<FieldOptionsHarness />);

        fireEvent.change(screen.getByLabelText('Label'), {
            target: { value: 'Pending label' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Remove field' }));
        expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add field' }));

        expect(screen.getByLabelText('Label')).toHaveValue('Default');
    });
    it('drops pending edits when the query removes their field', () => {
        vi.useFakeTimers();
        renderWithProviders(<FieldOptionsHarness />);
        fireEvent.change(screen.getByLabelText('Label'), {
            target: { value: 'Pending revenue' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Remove total from query' }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Add total to query' }),
        );
        expect(screen.getByLabelText('Label')).toHaveValue('Default');
    });

    it('keeps edits to an automatically rebound field when the panel closes', () => {
        vi.useFakeTimers();
        renderWithProviders(<FieldOptionsHarness />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Remove total from query' }),
        );
        expect(
            screen.getByRole('group', { name: 'orders_count options' }),
        ).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Label'), {
            target: { value: 'Count label' },
        });
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(screen.getByLabelText('Label')).toHaveValue('Count label');
        fireEvent.click(screen.getByRole('button', { name: 'Toggle panel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle panel' }));
        expect(screen.getByLabelText('Label')).toHaveValue('Count label');
    });

    it('drops a pending rebound field edit when its binding is cleared', () => {
        vi.useFakeTimers();
        renderWithProviders(<FieldOptionsHarness />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Remove total from query' }),
        );
        fireEvent.change(screen.getByLabelText('Label'), {
            target: { value: 'Pending count label' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Remove field' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
        expect(screen.getByLabelText('Label')).toHaveValue('Default');
    });

    it('flushes a pending rebound field edit when only the panel closes', () => {
        vi.useFakeTimers();
        renderWithProviders(<FieldOptionsHarness />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Remove total from query' }),
        );
        fireEvent.change(screen.getByLabelText('Label'), {
            target: { value: 'Pending count label' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Toggle panel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Toggle panel' }));
        expect(screen.getByLabelText('Label')).toHaveValue(
            'Pending count label',
        );
    });
});

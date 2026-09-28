import { getDataAppVizFieldIds, type DataAppVizField } from '@lightdash/common';
import { Button } from '@mantine/core';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useDataAppVizVisualizationConfig from '../../../hooks/useDataAppVizVisualizationConfig';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizFieldOptions from './DataAppVizFieldOptions';

const field: DataAppVizField = {
    name: 'values',
    label: 'Metrics',
    type: 'metric',
    required: false,
    multiple: true,
    configOptions: [
        { name: 'label', label: 'Label', type: 'text', default: 'Default' },
    ],
};

const FieldOptionsHarness = () => {
    const { validConfig, setField, setFieldOption } =
        useDataAppVizVisualizationConfig({
            dataAppVizUuid: 'viz-1',
            fieldMapping: { values: ['orders_total'] },
            fieldOptionValues: {},
        });

    return (
        <>
            <Button onClick={() => setField('values', [])}>Remove field</Button>
            <Button onClick={() => setField('values', ['orders_total'])}>
                Add field
            </Button>
            <DataAppVizFieldOptions
                field={field}
                group={null}
                fieldIds={getDataAppVizFieldIds(
                    validConfig?.fieldMapping.values,
                )}
                getFieldLabel={() => 'Total'}
                values={validConfig?.fieldOptionValues.values ?? {}}
                colorPalette={[]}
                onChange={(fieldId, name, value) =>
                    setFieldOption('viz-1', 'values', fieldId, name, value)
                }
            />
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
});

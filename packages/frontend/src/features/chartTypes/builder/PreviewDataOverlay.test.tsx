import {
    DimensionType,
    FieldType,
    type CompiledDimension,
    type ItemsMap,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import PreviewDataOverlay from './PreviewDataOverlay';

const plan: CompiledDimension = {
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'plan',
    label: 'Plan',
    table: 'customers',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
};

const itemsMap: ItemsMap = { customers_plan: plan };

describe('PreviewDataOverlay', () => {
    it('says what does not fit and keeps sample data available', () => {
        const onUseSampleData = vi.fn();
        renderWithProviders(
            <PreviewDataOverlay
                reason={{
                    kind: 'doesNotFit',
                    itemsMap,
                    issues: [
                        {
                            fieldName: 'value',
                            label: 'Value',
                            expects: 'metric',
                            mapped: {
                                fieldId: 'customers_plan',
                                kind: 'dimension',
                            },
                        },
                    ],
                }}
                onUseSampleData={onUseSampleData}
            />,
        );

        expect(
            screen.getByText('This data does not fit the chart yet'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Value needs a metric. Plan is a dimension, so the chart has no value to size itself by. Fix the input on the right, or keep designing on sample data.',
            ),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: 'Preview on sample data' }),
        );

        expect(onUseSampleData).toHaveBeenCalledOnce();
    });

    it('carries the reason an explore could not be read', () => {
        renderWithProviders(
            <PreviewDataOverlay
                reason={{
                    kind: 'unavailable',
                    message: 'You do not have access to this explore.',
                }}
                onUseSampleData={vi.fn()}
            />,
        );

        expect(
            screen.getByText('This data cannot be read'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'You do not have access to this explore. Pick different data, or keep designing on sample data.',
            ),
        ).toBeInTheDocument();
    });
});

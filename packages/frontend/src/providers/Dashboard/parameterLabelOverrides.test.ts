import { type ParameterDefinitions } from '@lightdash/common';
import { applyParameterLabelOverrides } from './parameterLabelOverrides';

const parameterDefinitions: ParameterDefinitions = {
    order_region: {
        label: 'Order region',
        description: 'Region where the order was placed',
        default: 'EU',
        options: ['EU', 'US'],
    },
    min_order_total: {
        label: 'Minimum order total',
        type: 'number',
        allow_custom_values: true,
    },
};

describe('applyParameterLabelOverrides', () => {
    it('translates labels by parameter name and leaves other fields untouched', () => {
        const result = applyParameterLabelOverrides(parameterDefinitions, {
            order_region: { label: 'Región del pedido' },
            min_order_total: { label: 'Pedido mínimo' },
        });

        expect(result.order_region).toEqual({
            ...parameterDefinitions.order_region,
            label: 'Región del pedido',
        });
        expect(result.min_order_total).toEqual({
            ...parameterDefinitions.min_order_total,
            label: 'Pedido mínimo',
        });
        expect(parameterDefinitions.order_region.label).toBe('Order region');
    });

    it('ignores overrides for parameters that are not defined', () => {
        const result = applyParameterLabelOverrides(parameterDefinitions, {
            another_parameter: { label: 'Otro parámetro' },
        });

        expect(result).toBe(parameterDefinitions);
    });

    it('returns definitions unchanged when there are no overrides', () => {
        expect(
            applyParameterLabelOverrides(parameterDefinitions, undefined),
        ).toBe(parameterDefinitions);
    });

    it('ignores empty-string labels', () => {
        const result = applyParameterLabelOverrides(parameterDefinitions, {
            order_region: { label: '' },
        });

        expect(result).toBe(parameterDefinitions);
    });

    it('only applies string labels from SDK input', () => {
        const result = applyParameterLabelOverrides(parameterDefinitions, {
            order_region: {
                // A host can pass untyped contentOverrides at runtime.
                label: 42 as unknown as string,
            },
        });

        expect(result).toBe(parameterDefinitions);
    });
});

import { mergeExisting } from './merge';

describe('mergeExisting', () => {
    it('overrides only keys that exist on the left, recursing into objects and arrays', () => {
        const left = {
            name: 'Revenue',
            description: 'Total',
            config: { title: 'Chart', axes: [{ label: 'x' }, { label: 'y' }] },
        };
        const right = {
            name: 'Receita',
            config: { title: 'Gráfico', axes: [{ label: 'eixo x' }] },
            extra: 'ignored',
        };

        expect(mergeExisting(left, right)).toEqual({
            name: 'Receita',
            description: 'Total',
            config: {
                title: 'Gráfico',
                axes: [{ label: 'eixo x' }, { label: 'y' }],
            },
        });
    });
});

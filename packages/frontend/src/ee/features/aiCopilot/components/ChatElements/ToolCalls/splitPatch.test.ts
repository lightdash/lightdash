import { describe, expect, it } from 'vitest';
import { getModelsOfFiles, recountHunks } from './splitPatch';

describe('getModelsOfFiles', () => {
    it('reads models off files under a models folder, once each', () => {
        expect(
            getModelsOfFiles([
                { path: 'models/orders.yml' },
                { path: 'dbt/models/marts/orders.sql' },
                { path: 'models/customers.yaml' },
                { path: 'dbt_project.yml' },
                { path: 'macros/cents.sql' },
            ]),
        ).toEqual(['customers', 'orders']);
    });
});

describe('recountHunks', () => {
    it('fixes miscounted headers and keeps blank lines as context', () => {
        const patch = [
            '--- models/orders.yml',
            '+++ models/orders.yml',
            '@@ -3,8 +3,12 @@ models:',
            '   - name: orders',
            '-    description: old',
            '+    description: new',
            '',
            '     columns:',
            '-- old comment line',
            '',
        ].join('\n');
        expect(recountHunks(patch)).toBe(
            [
                '--- models/orders.yml',
                '+++ models/orders.yml',
                '@@ -3,5 +3,4 @@ models:',
                '   - name: orders',
                '-    description: old',
                '+    description: new',
                ' ',
                '     columns:',
                '-- old comment line',
                '',
            ].join('\n'),
        );
    });
});

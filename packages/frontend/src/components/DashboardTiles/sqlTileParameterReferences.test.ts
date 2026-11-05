import { describe, expect, it } from 'vitest';
import { getSqlTileParameterReport } from './sqlTileParameterReferences';

describe('getSqlTileParameterReport', () => {
    it('reports nothing while the SQL chart is loading', () => {
        expect(
            getSqlTileParameterReport({ sql: undefined, hasError: false }),
        ).toBeNull();
    });

    it('reports a failed load as a run without references', () => {
        expect(
            getSqlTileParameterReport({ sql: undefined, hasError: true }),
        ).toEqual({ references: null });
    });

    it('reports the references in the loaded SQL', () => {
        expect(
            getSqlTileParameterReport({
                sql: 'select ${lightdash.parameters.region}',
                hasError: false,
            }),
        ).toEqual({ references: ['region'] });
    });
});

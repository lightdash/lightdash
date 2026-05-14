import { SupportedDbtAdapter } from '@lightdash/common';
import { SUPPORTED_DIALECTS } from '@lightdash/formula';
import { mapAdapterToFormulaDialect } from './formulaDialectMapper';

describe('mapAdapterToFormulaDialect', () => {
    // Derived from SUPPORTED_DIALECTS so the test and the runtime source of
    // truth cannot drift. A new dialect added to the formula package picks
    // up a passing case here automatically.
    test.each(SUPPORTED_DIALECTS)(
        'returns %s for the matching adapter',
        (dialect) => {
            expect(
                mapAdapterToFormulaDialect(dialect as SupportedDbtAdapter),
            ).toBe(dialect);
        },
    );
});

import { CONTENT_AS_CODE_VERSIONS } from '@lightdash/common';
import { readdirSync } from 'fs';

describe('content-as-code schema contract registry', () => {
    it('has one field-coverage test per registered resource', () => {
        const resourceTests = readdirSync(__dirname)
            .filter(
                (fileName) =>
                    fileName.endsWith('.test.ts') &&
                    fileName !== 'registry.test.ts',
            )
            .map((fileName) => fileName.replace('.test.ts', ''))
            .sort();

        expect(resourceTests).toEqual(
            Object.keys(CONTENT_AS_CODE_VERSIONS).sort(),
        );
    });
});

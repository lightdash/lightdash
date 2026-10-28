import moment from 'moment-timezone';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

describe('Moment locale security', () => {
    afterEach(() => moment.locale('en'));

    it('does not load a module through a crafted non-string locale name', () => {
        const directory = mkdtempSync(
            join(tmpdir(), 'lightdash-moment-locale-'),
        );
        const marker = join(directory, 'loaded');
        const modulePath = join(directory, 'locale.cjs');
        const require = createRequire(import.meta.url);
        const localePath = relative(
            join(dirname(require.resolve('moment')), 'locale'),
            modulePath,
        );
        writeFileSync(
            modulePath,
            `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'loaded');`,
        );

        try {
            Reflect.apply(moment.locale, moment, [
                {
                    match: () => ['safe'],
                    toString: () => localePath,
                    toLowerCase: () => 'en',
                },
            ]);

            expect(existsSync(marker)).toBe(false);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});

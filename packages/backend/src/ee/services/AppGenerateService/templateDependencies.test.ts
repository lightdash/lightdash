import { readFileSync } from 'fs';
import * as path from 'path';
import {
    buildTemplateBaseline,
    QUERY_SDK_PACKAGE,
    TEMPLATE_DEPENDENCIES,
    TEMPLATE_SCRIPTS,
} from './templateDependencies';

describe('TEMPLATE_DEPENDENCIES', () => {
    it('matches the dependencies of sandboxes/data-apps/template/package.json (drift guard)', () => {
        const templatePackageJsonPath = path.join(
            __dirname,
            '..',
            '..',
            '..',
            '..',
            '..',
            '..',
            'sandboxes',
            'data-apps',
            'template',
            'package.json',
        );
        const parsed = JSON.parse(
            readFileSync(templatePackageJsonPath, 'utf-8'),
        ) as {
            dependencies: Record<string, string>;
            scripts: Record<string, string>;
        };

        expect(TEMPLATE_DEPENDENCIES).toEqual(parsed.dependencies);
        expect(TEMPLATE_SCRIPTS).toEqual(parsed.scripts);
    });
});

describe('buildTemplateBaseline', () => {
    it('mirrors the declared @lightdash/query-sdk spec so any SDK version is template', () => {
        const packageJson = JSON.stringify({
            dependencies: { [QUERY_SDK_PACKAGE]: '0.1234.0' },
        });
        const baseline = buildTemplateBaseline(packageJson);
        expect(baseline[QUERY_SDK_PACKAGE]).toBe('0.1234.0');
        // Everything else is untouched
        expect(baseline.react).toBe(TEMPLATE_DEPENDENCIES.react);
    });

    it('falls back to the template SDK spec when the declared one is missing', () => {
        const baseline = buildTemplateBaseline(
            JSON.stringify({ dependencies: {} }),
        );
        expect(baseline[QUERY_SDK_PACKAGE]).toBe(
            TEMPLATE_DEPENDENCIES[QUERY_SDK_PACKAGE],
        );
    });

    it('returns the plain template baseline for unparseable packageJson', () => {
        expect(buildTemplateBaseline('not json')).toEqual(
            TEMPLATE_DEPENDENCIES,
        );
    });
});

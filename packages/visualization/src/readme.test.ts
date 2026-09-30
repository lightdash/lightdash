import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * Every ```ts sample in the README compiles against the package's source.
 * The values a caller brings (a saved chart, its rows, a DOM element) are
 * declared once in `globals.d.ts` below; the samples import everything else.
 */

const packageDir = join(__dirname, '..');
// Under the package's node_modules so the samples resolve its dependencies.
const samplesDir = join(packageDir, 'node_modules', '.readme-samples');

const readmeSamples = (): string[] =>
    Array.from(
        readFileSync(join(packageDir, 'README.md'), 'utf8').matchAll(
            /^```ts\n([\s\S]*?)^```$/gm,
        ),
        (match) => match[1],
    );

const callerValues = `
declare const savedChart: import('@lightdash/common').SavedChart;
declare const itemsMap: import('@lightdash/common').ItemsMap;
declare const metricQuery: import('@lightdash/common').MetricQuery;
declare const rows: import('@lightdash/common').ResultRow[];
declare const rawRows: Record<string, unknown>[];
declare const pivotDetails: import('@lightdash/visualization').VisualizationResults['pivotDetails'];
declare const colorPalette: string[];
declare const el: HTMLElement;
`;

describe('README', () => {
    test('every ts sample typechecks', () => {
        const samples = readmeSamples();
        expect(samples.length).toBeGreaterThan(0);

        rmSync(samplesDir, { recursive: true, force: true });
        mkdirSync(samplesDir, { recursive: true });
        writeFileSync(join(samplesDir, 'globals.d.ts'), callerValues);
        samples.forEach((sample, index) => {
            // `export {}` keeps each sample its own module.
            writeFileSync(
                join(samplesDir, `sample${index + 1}.ts`),
                `${sample}\nexport {};\n`,
            );
        });
        writeFileSync(
            join(samplesDir, 'tsconfig.json'),
            JSON.stringify({
                compilerOptions: {
                    target: 'ES2020',
                    module: 'esnext',
                    moduleResolution: 'bundler',
                    lib: ['ESNext', 'DOM'],
                    strict: true,
                    noEmit: true,
                    skipLibCheck: true,
                    types: ['node'],
                    paths: {
                        '@lightdash/visualization': ['../../src/index.ts'],
                        '@lightdash/visualization/editor': [
                            '../../src/editor.ts',
                        ],
                    },
                },
                include: ['*.ts'],
            }),
        );

        let output = '';
        try {
            execFileSync(
                join(packageDir, 'node_modules', '.bin', 'tsc'),
                ['-p', samplesDir],
                { encoding: 'utf8', stdio: 'pipe' },
            );
        } catch (error) {
            const { stdout, stderr } = error as {
                stdout?: string;
                stderr?: string;
            };
            output = `${stdout ?? ''}${stderr ?? ''}`;
        }
        expect(output).toBe('');
    }, 60_000);
});

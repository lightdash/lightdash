import { parse } from '@babel/parser';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

const root = path.join(__dirname, '..');

const isScriptGuard = (statement: { type: string }, code: string) =>
    statement.type === 'IfStatement' && code.includes('require.main');

// Bundlers drop modules not listed in "sideEffects", so top-level calls like dayjs.extend must be allowlisted
const findFilesWithTopLevelEffects = () =>
    readdirSync(path.join(root, 'src'), { recursive: true, encoding: 'utf8' })
        .filter(
            (file) =>
                file.endsWith('.ts') &&
                !file.endsWith('.d.ts') &&
                !file.endsWith('.test.ts') &&
                !file.includes('__mocks__'),
        )
        .filter((file) => {
            const code = readFileSync(path.join(root, 'src', file), 'utf8');
            const { body } = parse(code, {
                sourceType: 'module',
                plugins: ['typescript'],
            }).program;
            return body.some(
                (statement) =>
                    (statement.type === 'ExpressionStatement' &&
                        !(
                            statement.expression.type === 'UnaryExpression' &&
                            statement.expression.operator === 'void'
                        )) ||
                    (statement.type === 'IfStatement' &&
                        !isScriptGuard(
                            statement,
                            code.slice(
                                statement.start ?? 0,
                                statement.end ?? 0,
                            ),
                        )),
            );
        })
        .map((file) => `./src/${file.split(path.sep).join('/')}`)
        .sort();

describe('package.json sideEffects', () => {
    it('lists every source file with top-level side effects', () => {
        const srcEntries = packageJson.sideEffects
            .filter((entry) => entry.startsWith('./src/'))
            .sort();
        expect(findFilesWithTopLevelEffects()).toEqual(srcEntries);
    });

    it('lists the built file for every source entry', () => {
        const srcEntries = packageJson.sideEffects.filter((entry) =>
            entry.startsWith('./src/'),
        );
        srcEntries.forEach((entry) => {
            expect(packageJson.sideEffects).toContain(
                entry.replace('./src/', './dist/*/').replace(/\.ts$/, '.js'),
            );
        });
    });
});

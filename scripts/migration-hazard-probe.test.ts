import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeSource } from './migration-hazard-probe';

const repositoryRoot = fs.existsSync(
    path.resolve(process.cwd(), 'packages/backend'),
)
    ? process.cwd()
    : path.resolve(process.cwd(), '../..');

const migrationDirectory = path.join(
    repositoryRoot,
    'packages/backend/src/database/migrations',
);

const probeMigration = (fileName: string) => {
    const file = path.join(migrationDirectory, fileName);
    return probeSource(fs.readFileSync(file, 'utf8'), file);
};

describe('migration hazard probe seed migrations', () => {
    it('flags the saved chart timezone incident shape', () => {
        const report = probeMigration(
            '20260610120000_default_saved_chart_timezone_to_project.ts',
        );

        expect(report.flags).toMatchObject({
            terminationDependsOnZeroMatches: true,
            hasMonotoneCursor: false,
            hasPreLoopCutoff: false,
            disablesStatementTimeout: true,
            lacksLockTimeout: true,
        });
    });

    it('flags all scheduler loops with the same unbounded shape', () => {
        const report = probeMigration(
            '20260713120324_add_slug_to_scheduler.ts',
        );

        expect(report.flags).toMatchObject({
            terminationDependsOnZeroMatches: true,
            hasMonotoneCursor: false,
            disablesStatementTimeout: true,
            lacksLockTimeout: true,
        });
        expect(report.loopCount).toBe(3);
    });

    it('detects the dashboards scan cursor through its helper call', () => {
        const report = probeMigration(
            '20260722072235_add_project_uuid_to_dashboards.ts',
        );

        expect(report.flags).toMatchObject({
            terminationDependsOnZeroMatches: true,
            hasMonotoneCursor: true,
            hasPreLoopCutoff: true,
            lacksLockTimeout: false,
            disablesStatementTimeout: false,
        });
    });
});

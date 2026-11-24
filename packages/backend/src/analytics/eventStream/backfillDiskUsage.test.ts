import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
    directoryBytes,
    diskBudgetUsage,
    TempDiskMonitor,
} from './backfillDiskUsage';

describe('backfill disk usage', () => {
    let directory: string;
    beforeEach(async () => {
        directory = await mkdtemp(path.join(tmpdir(), 'disk-usage-test-'));
    });
    afterEach(async () => {
        vi.useRealTimers();
        await rm(directory, { recursive: true, force: true });
    });

    it('sums files in nested directories and treats a missing directory as empty', async () => {
        await writeFile(path.join(directory, 'history.jsonl'), 'a'.repeat(10));
        await mkdir(path.join(directory, 'duckdb-temp-1'));
        await writeFile(
            path.join(directory, 'duckdb-temp-1', 'spill.tmp'),
            'b'.repeat(25),
        );
        expect(await directoryBytes(directory)).toBe(35);
        expect(await directoryBytes(path.join(directory, 'gone'))).toBe(0);
    });

    it.each([
        [699, 69.9, false],
        [700, 70, true],
        [1500, 150, true],
    ])(
        'reports %s of 1000 bytes as %s%% and near budget %s',
        (bytes, percent, nearBudget) => {
            expect(diskBudgetUsage(bytes, 1000)).toEqual({
                diskBudgetUsedPercent: percent,
                nearBudget,
            });
        },
    );

    it('never reports a percentage or warning without a budget', () => {
        expect(diskBudgetUsage(10 ** 12, null)).toEqual({
            diskBudgetUsedPercent: null,
            nearBudget: false,
        });
    });

    it('keeps the peak across interval samples and stops sampling once stopped', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        const samples: number[] = [];
        const monitor = new TempDiskMonitor(directory, 1000, (bytes) =>
            samples.push(bytes),
        );
        monitor.start();
        const spill = path.join(directory, 'spill.tmp');
        await writeFile(spill, 'x'.repeat(100));
        await vi.advanceTimersByTimeAsync(1000);
        await monitor.sample();
        await rm(spill);
        await writeFile(path.join(directory, 'out.parquet'), 'y'.repeat(40));
        expect(await monitor.stop()).toBe(100);
        expect(samples).toContain(100);
        expect(samples.at(-1)).toBe(40);
        const count = samples.length;
        await vi.advanceTimersByTimeAsync(5000);
        expect(await monitor.stop()).toBe(100);
        expect(samples).toHaveLength(count);
    });
});

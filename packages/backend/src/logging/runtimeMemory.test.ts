import {
    buildRuntimeMemoryReport,
    readContainerMemoryLimitBytes,
} from './runtimeMemory';

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

const reader = (values: Record<string, string>) => (path: string) => {
    if (path in values) return values[path];
    throw new Error('ENOENT');
};

describe('readContainerMemoryLimitBytes', () => {
    it('reads the cgroup v2 limit', () => {
        expect(
            readContainerMemoryLimitBytes(
                reader({ '/sys/fs/cgroup/memory.max': `${4 * GIB}\n` }),
            ),
        ).toEqual(4 * GIB);
    });

    it('falls back to the cgroup v1 limit', () => {
        expect(
            readContainerMemoryLimitBytes(
                reader({
                    '/sys/fs/cgroup/memory/memory.limit_in_bytes': `${8 * GIB}`,
                }),
            ),
        ).toEqual(8 * GIB);
    });

    it('treats "max" as no limit', () => {
        expect(
            readContainerMemoryLimitBytes(
                reader({ '/sys/fs/cgroup/memory.max': 'max' }),
            ),
        ).toBeNull();
    });

    it('treats the cgroup v1 unlimited sentinel as no limit', () => {
        expect(
            readContainerMemoryLimitBytes(
                reader({
                    '/sys/fs/cgroup/memory/memory.limit_in_bytes':
                        '9223372036854771712',
                }),
            ),
        ).toBeNull();
    });

    it('ignores an implausibly small limit', () => {
        expect(
            readContainerMemoryLimitBytes(
                reader({ '/sys/fs/cgroup/memory.max': `${MIB}` }),
            ),
        ).toBeNull();
    });

    it('returns null when nothing is readable', () => {
        expect(readContainerMemoryLimitBytes(reader({}))).toBeNull();
    });
});

describe('buildRuntimeMemoryReport', () => {
    it('warns when the heap sits far below a known container limit', () => {
        // the shipping default: a 12 GiB pod runs the same 2,240 MB heap as a 4 GiB pod
        const report = buildRuntimeMemoryReport({
            heapLimitBytes: 2240 * MIB,
            containerMemoryLimitBytes: 12 * GIB,
            nodeOptions: null,
            availableParallelism: 8,
        });
        expect(report.heapFlagSet).toBe(false);
        expect(report.warning).toContain('2240MB');
        expect(report.warning).toContain('12288MB');
        expect(report.warning).toContain('--max-old-space-size=9216');
    });

    it('does not warn once the flag is set', () => {
        expect(
            buildRuntimeMemoryReport({
                heapLimitBytes: 2240 * MIB,
                containerMemoryLimitBytes: 12 * GIB,
                nodeOptions: '--max-old-space-size=9216',
                availableParallelism: 8,
            }).warning,
        ).toBeNull();
    });

    it('does not warn when the heap already uses most of the limit', () => {
        expect(
            buildRuntimeMemoryReport({
                heapLimitBytes: 3072 * MIB,
                containerMemoryLimitBytes: 4 * GIB,
                nodeOptions: null,
                availableParallelism: 8,
            }).warning,
        ).toBeNull();
    });

    it('does not warn when no container limit is readable', () => {
        expect(
            buildRuntimeMemoryReport({
                heapLimitBytes: 4288 * MIB,
                containerMemoryLimitBytes: null,
                nodeOptions: null,
                availableParallelism: 8,
            }).warning,
        ).toBeNull();
    });

    it('reports the flag as set when NODE_OPTIONS carries other flags too', () => {
        expect(
            buildRuntimeMemoryReport({
                heapLimitBytes: 8192 * MIB,
                containerMemoryLimitBytes: 12 * GIB,
                nodeOptions: '--enable-source-maps --max-old-space-size=8192',
                availableParallelism: 8,
            }).heapFlagSet,
        ).toBe(true);
    });
});

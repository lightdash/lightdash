import { lstat, readdir } from 'fs/promises';
import path from 'path';

export const DISK_BUDGET_WARNING_RATIO = 0.7;

const isMissing = (error: unknown) =>
    (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

/** Apparent size of every file below a directory; files removed mid-walk count as 0. */
export const directoryBytes = async (directory: string): Promise<number> => {
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (isMissing(error)) return 0;
        throw error;
    }
    const sizes = await Promise.all(
        entries.map(async (entry) => {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) return directoryBytes(target);
            try {
                return (await lstat(target)).size;
            } catch (error) {
                if (isMissing(error)) return 0;
                throw error;
            }
        }),
    );
    return sizes.reduce((total, size) => total + size, 0);
};

export const diskBudgetUsage = (
    bytes: number,
    budgetBytes: number | null,
): { diskBudgetUsedPercent: number | null; nearBudget: boolean } => {
    if (budgetBytes === null)
        return { diskBudgetUsedPercent: null, nearBudget: false };
    return {
        diskBudgetUsedPercent: Math.round((bytes / budgetBytes) * 1000) / 10,
        nearBudget: bytes >= budgetBytes * DISK_BUDGET_WARNING_RATIO,
    };
};

export class TempDiskMonitor {
    private peak = 0;

    private timer: NodeJS.Timeout | null = null;

    private pending: Promise<void> | null = null;

    private stopped = false;

    constructor(
        private readonly directory: string,
        private readonly intervalMs: number,
        private readonly onSample: (bytes: number) => void,
    ) {}

    get peakBytes(): number {
        return this.peak;
    }

    start(): void {
        this.timer = setInterval(() => {
            void this.sample();
        }, this.intervalMs);
        this.timer.unref();
    }

    sample(): Promise<void> {
        if (this.stopped) return Promise.resolve();
        if (!this.pending) {
            this.pending = directoryBytes(this.directory)
                .then((bytes) => {
                    this.peak = Math.max(this.peak, bytes);
                    this.onSample(bytes);
                })
                .catch(() => undefined)
                .finally(() => {
                    this.pending = null;
                });
        }
        return this.pending;
    }

    async stop(): Promise<number> {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (!this.stopped) {
            await this.pending;
            await this.sample();
            this.stopped = true;
        }
        return this.peak;
    }
}

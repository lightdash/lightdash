import pLimit from 'p-limit';
import { type ProjectAdapter } from '../types';

type DiskEntry = {
    adapter: ProjectAdapter | null;
    resident: boolean;
    active: boolean;
    lastUsed: number;
};

export class DbtSourceDiskPool {
    readonly stats = { diskEvictions: 0, diskRecreations: 0 };

    private readonly entries = new Map<string, DiskEntry>();

    private readonly lock = pLimit(1);

    private readonly waiters = new Set<() => void>();

    private clock = 0;

    constructor(private readonly capacity: number) {}

    private notify() {
        for (const wake of this.waiters) wake();
        this.waiters.clear();
    }

    private async acquire(
        key: string,
        signal?: AbortSignal,
    ): Promise<DiskEntry> {
        signal?.throwIfAborted();
        let wake = () => {};
        const available = new Promise<void>((resolve) => {
            wake = resolve;
        });
        const entry = await this.lock(async () => {
            signal?.throwIfAborted();
            const current = this.entries.get(key);
            if (current?.active) {
                this.waiters.add(wake);
                return null;
            }
            if (!current?.resident) {
                const resident = [...this.entries.values()].filter(
                    (item) => item.resident,
                );
                if (resident.length >= Math.max(1, this.capacity)) {
                    const oldest = resident
                        .filter((item) => !item.active)
                        .sort((a, b) => a.lastUsed - b.lastUsed)[0];
                    if (!oldest) {
                        this.waiters.add(wake);
                        return null;
                    }
                    await oldest.adapter?.releaseDisk();
                    oldest.resident = false;
                    this.stats.diskEvictions += 1;
                }
                if (current) this.stats.diskRecreations += 1;
            }
            const acquired = current ?? {
                adapter: null,
                resident: false,
                active: false,
                lastUsed: 0,
            };
            acquired.active = true;
            acquired.resident = true;
            this.entries.set(key, acquired);
            return acquired;
        });
        if (entry === null) {
            signal?.addEventListener('abort', wake, { once: true });
            if (signal?.aborted) wake();
            try {
                await available;
            } finally {
                signal?.removeEventListener('abort', wake);
                this.waiters.delete(wake);
            }
            return this.acquire(key, signal);
        }
        return entry;
    }

    async run<T>(
        key: string,
        getAdapter: () => Promise<ProjectAdapter>,
        operation: (adapter: ProjectAdapter) => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        const entry = await this.acquire(key, signal);
        try {
            signal?.throwIfAborted();
            entry.adapter ??= await getAdapter();
            signal?.throwIfAborted();
            return await operation(entry.adapter);
        } finally {
            entry.active = false;
            this.clock += 1;
            entry.lastUsed = this.clock;
            this.notify();
        }
    }

    async release(key: string): Promise<void> {
        let wake = () => {};
        const available = new Promise<void>((resolve) => {
            wake = resolve;
        });
        const released = await this.lock(async () => {
            const entry = this.entries.get(key);
            if (entry?.active) {
                this.waiters.add(wake);
                return false;
            }
            if (entry?.resident) {
                await entry.adapter?.releaseDisk();
                entry.resident = false;
            }
            return true;
        });
        if (!released) {
            await available;
            return this.release(key);
        }
        this.notify();
    }
}

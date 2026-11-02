type Waiter = {
    tileUuid: string;
    grant: () => void;
};

/**
 * Caps how many dashboard tiles run a query at once. A tile holds its slot
 * until it releases it, so the cap covers the whole query lifecycle, not just
 * the request that starts it. Waiting tiles that are on screen go first.
 */
export class TileQueryQueue {
    private readonly running = new Set<string>();

    private readonly visible = new Set<string>();

    private waiting: Waiter[] = [];

    constructor(private readonly maxConcurrent: number) {}

    acquire(tileUuid: string, signal: AbortSignal | undefined): Promise<void> {
        if (this.running.has(tileUuid)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const abort = () => {
                this.waiting = this.waiting.filter((w) => w !== waiter);
                reject(signal?.reason);
            };
            const waiter: Waiter = {
                tileUuid,
                grant: () => {
                    signal?.removeEventListener('abort', abort);
                    resolve();
                },
            };

            signal?.addEventListener('abort', abort, { once: true });
            this.waiting = [...this.waiting, waiter];
            this.startWaiting();
        });
    }

    release(tileUuid: string): void {
        if (this.running.delete(tileUuid)) {
            this.startWaiting();
        }
    }

    setVisible(tileUuid: string, isVisible: boolean): void {
        if (isVisible) {
            this.visible.add(tileUuid);
        } else {
            this.visible.delete(tileUuid);
        }
    }

    private startWaiting(): void {
        while (this.running.size < this.maxConcurrent) {
            const next = this.nextWaiter();
            if (!next) {
                return;
            }
            this.start(next.tileUuid);
        }
    }

    private nextWaiter(): Waiter | undefined {
        return (
            this.waiting.find((w) => this.visible.has(w.tileUuid)) ??
            this.waiting[0]
        );
    }

    private start(tileUuid: string): void {
        const granted = this.waiting.filter((w) => w.tileUuid === tileUuid);
        this.waiting = this.waiting.filter((w) => w.tileUuid !== tileUuid);
        this.running.add(tileUuid);
        granted.forEach((w) => w.grant());
    }
}

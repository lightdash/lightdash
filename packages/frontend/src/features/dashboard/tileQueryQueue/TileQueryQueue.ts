type ReleaseSlot = () => void;

type Waiter = {
    tileUuid: string;
    grant: (release: ReleaseSlot) => void;
};

/**
 * Caps how many tile query executions run at once. Each execution holds its
 * own slot until it releases it, so a tile that starts a new query (say, after
 * a filter change) waits like any other while its previous one still runs.
 * Waiting tiles that are on screen go first.
 */
export class TileQueryQueue {
    private running = 0;

    private readonly visible = new Set<string>();

    private waiting: Waiter[] = [];

    constructor(private readonly maxConcurrent: number) {}

    /** Resolves with the slot's release once the tile may start a query. */
    acquire(
        tileUuid: string,
        signal: AbortSignal | undefined,
    ): Promise<ReleaseSlot> {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(signal.reason);
                return;
            }
            const abort = () => {
                this.waiting = this.waiting.filter((w) => w !== waiter);
                reject(signal?.reason);
            };
            const waiter: Waiter = {
                tileUuid,
                grant: (release) => {
                    signal?.removeEventListener('abort', abort);
                    resolve(release);
                },
            };

            signal?.addEventListener('abort', abort, { once: true });
            this.waiting = [...this.waiting, waiter];
            this.startWaiting();
        });
    }

    setVisible(tileUuid: string, isVisible: boolean): void {
        if (isVisible) {
            this.visible.add(tileUuid);
        } else {
            this.visible.delete(tileUuid);
        }
    }

    private startWaiting(): void {
        while (this.running < this.maxConcurrent) {
            const next = this.nextWaiter();
            if (!next) {
                return;
            }
            this.waiting = this.waiting.filter((w) => w !== next);
            this.running += 1;
            next.grant(this.createRelease());
        }
    }

    private nextWaiter(): Waiter | undefined {
        return (
            this.waiting.find((w) => this.visible.has(w.tileUuid)) ??
            this.waiting[0]
        );
    }

    private createRelease(): ReleaseSlot {
        let isReleased = false;
        return () => {
            if (isReleased) {
                return;
            }
            isReleased = true;
            this.running -= 1;
            this.startWaiting();
        };
    }
}

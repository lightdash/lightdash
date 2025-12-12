/**
 * A simple counting semaphore for limiting concurrent operations.
 * Used to prevent overwhelming the headless browser with too many simultaneous connections.
 */
export class Semaphore {
    private permits: number;

    private waiting: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<void> {
        if (this.permits > 0) {
            this.permits -= 1;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.waiting.push(resolve);
        });
    }

    release(): void {
        const next = this.waiting.shift();
        if (next) {
            next();
        } else {
            this.permits += 1;
        }
    }

    /** Returns number of operations currently waiting for a permit */
    get queueLength(): number {
        return this.waiting.length;
    }

    /** Returns number of available permits */
    get availablePermits(): number {
        return this.permits;
    }
}

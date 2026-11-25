type ByteBudgetWaiter = {
    bytes: number;
    grant: () => void;
};

export class ByteBudget {
    private used = 0;

    private readonly waiting: ByteBudgetWaiter[] = [];

    constructor(readonly limit: number) {}

    get inUse() {
        return this.used;
    }

    tryAcquire(bytes: number): (() => void) | undefined {
        if (this.used + bytes > this.limit) return undefined;
        return this.take(bytes);
    }

    acquire(bytes: number, signal?: AbortSignal): Promise<() => void> {
        if (signal?.aborted) return Promise.reject(signal.reason);
        if (this.waiting.length === 0 && this.fits(bytes)) {
            return Promise.resolve(this.take(bytes));
        }
        return new Promise((resolve, reject) => {
            const stopListening: Array<() => void> = [];
            const waiter: ByteBudgetWaiter = {
                bytes,
                grant: () => {
                    stopListening.forEach((stop) => stop());
                    resolve(this.take(bytes));
                },
            };
            const onAbort = () => {
                const index = this.waiting.indexOf(waiter);
                if (index !== -1) this.waiting.splice(index, 1);
                reject(signal?.reason);
                this.drain();
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            stopListening.push(() =>
                signal?.removeEventListener('abort', onAbort),
            );
            this.waiting.push(waiter);
        });
    }

    private fits(bytes: number) {
        return this.used === 0 || this.used + bytes <= this.limit;
    }

    private take(bytes: number): () => void {
        this.used += bytes;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.used -= bytes;
            this.drain();
        };
    }

    private drain() {
        while (this.waiting.length > 0 && this.fits(this.waiting[0].bytes)) {
            this.waiting.shift()!.grant();
        }
    }
}

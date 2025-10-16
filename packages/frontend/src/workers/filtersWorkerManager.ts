/**
 * Singleton worker manager that initializes the worker eagerly
 * This ensures the worker is ready before any component mounts
 */
class FiltersWorkerManager {
    private worker: Worker | null = null;

    private reqId = 0;

    initialize() {
        if (this.worker) return; // Already initialized

        this.worker = new Worker(
            new URL('./filtersWorker.ts', import.meta.url),
            { type: 'module' },
        );
        console.log('[FiltersWorkerManager] Worker initialized eagerly');
    }

    getWorker(): Worker | null {
        return this.worker;
    }

    getNextReqId(): number {
        return ++this.reqId;
    }

    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            console.log('[FiltersWorkerManager] Worker terminated');
        }
    }
}

// Export singleton instance
export const filtersWorkerManager = new FiltersWorkerManager();

// Auto-initialize on module load (eager initialization)
if (typeof window !== 'undefined') {
    filtersWorkerManager.initialize();
}

import { Semaphore } from './Semaphore';

describe('Semaphore', () => {
    test('acquire decrements available permits', async () => {
        const semaphore = new Semaphore(3);
        expect(semaphore.availablePermits).toBe(3);

        await semaphore.acquire();
        expect(semaphore.availablePermits).toBe(2);
    });

    test('release increments available permits', async () => {
        const semaphore = new Semaphore(3);
        await semaphore.acquire();
        expect(semaphore.availablePermits).toBe(2);

        semaphore.release();
        expect(semaphore.availablePermits).toBe(3);
    });

    test('acquire waits when no permits available', async () => {
        const semaphore = new Semaphore(1);
        const order: number[] = [];

        await semaphore.acquire();
        expect(semaphore.availablePermits).toBe(0);

        // This should wait
        const waitingPromise = semaphore.acquire().then(() => {
            order.push(2);
        });

        expect(semaphore.queueLength).toBe(1);
        order.push(1);

        // Release to unblock waiting acquire
        semaphore.release();
        await waitingPromise;

        expect(order).toEqual([1, 2]);
        expect(semaphore.queueLength).toBe(0);
    });

    test('waiting acquires are released in FIFO order', async () => {
        const semaphore = new Semaphore(1);
        const order: number[] = [];

        await semaphore.acquire();

        const promise1 = semaphore.acquire().then(() => order.push(1));
        const promise2 = semaphore.acquire().then(() => order.push(2));
        const promise3 = semaphore.acquire().then(() => order.push(3));

        expect(semaphore.queueLength).toBe(3);

        semaphore.release(); // releases promise1
        semaphore.release(); // releases promise2
        semaphore.release(); // releases promise3

        await Promise.all([promise1, promise2, promise3]);

        expect(order).toEqual([1, 2, 3]);
    });

    test('release to waiting does not increment permits', async () => {
        const semaphore = new Semaphore(1);
        await semaphore.acquire();

        const waitingPromise = semaphore.acquire();
        expect(semaphore.queueLength).toBe(1);
        expect(semaphore.availablePermits).toBe(0);

        semaphore.release();
        await waitingPromise;

        // Permit went to waiter, not back to pool
        expect(semaphore.availablePermits).toBe(0);
        expect(semaphore.queueLength).toBe(0);
    });
});

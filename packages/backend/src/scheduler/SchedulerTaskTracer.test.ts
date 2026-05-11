// We assert on Sentry.startSpan invocation as the marker of "this task got
// wrapped". The traced wrapper calls Sentry.startSpan each time the handler
// runs; the bypass path does not. Sentry methods are read-only on the
// module namespace, so swap them out via jest.mock instead of spyOn.
const startSpanMock = jest.fn();
const continueTraceMock = jest.fn();
jest.mock('@sentry/node', () => {
    const actual = jest.requireActual('@sentry/node');
    return {
        ...actual,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        continueTrace: (_ctx: unknown, cb: any) => continueTraceMock(cb),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        startSpan: (opts: unknown, cb: any) => startSpanMock(opts, cb),
        setUser: jest.fn(),
        setTags: jest.fn(),
        addBreadcrumb: jest.fn(),
        captureException: jest.fn(),
        withScope: (cb: (s: { setFingerprint: jest.Mock }) => void) =>
            cb({ setFingerprint: jest.fn() }),
    };
});

// eslint-disable-next-line import/first
import { traceTasks } from './SchedulerTaskTracer';
// eslint-disable-next-line import/first
import type { TypedTaskList } from './types';

// Default behavior: just invoke the inner callback so the traced handler
// still runs.
continueTraceMock.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cb: any) => cb(),
);
startSpanMock.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_opts: unknown, cb: any) => cb({ setStatus: jest.fn() }),
);

const makeHelpers = () =>
    ({
        job: {
            id: 'job-1',
            queue_name: 'q',
            task_identifier: 'whatever',
            priority: 0,
            attempts: 0,
            max_attempts: 1,
            locked_at: null,
            locked_by: null,
            created_at: new Date(),
            key: null,
            run_at: new Date(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

describe('traceTasks — heartbeat tasks bypass the Sentry trace wrapper', () => {
    beforeEach(() => {
        startSpanMock.mockClear();
    });

    it('does NOT wrap workerHeartbeat:<poolId> in Sentry.startSpan', async () => {
        const innerHandler = jest.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ['workerHeartbeat:pod-abc' as any]: innerHandler,
        };

        const tracedList = traceTasks(tasks);
        const heartbeatTask = tracedList['workerHeartbeat:pod-abc'];

        expect(heartbeatTask).toBeDefined();
        // Invoke the (pass-through) traced task and confirm Sentry wasn't called.
        await heartbeatTask!({}, makeHelpers());

        expect(innerHandler).toHaveBeenCalledTimes(1);
        expect(startSpanMock).not.toHaveBeenCalled();
    });

    it('DOES wrap a regular scheduler task in Sentry.startSpan', async () => {
        const innerHandler = jest.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            checkForStuckJobs: innerHandler as any,
        };

        const tracedList = traceTasks(tasks);
        const wrappedTask = tracedList.checkForStuckJobs;

        expect(wrappedTask).toBeDefined();
        await wrappedTask!({}, makeHelpers());

        // The handler ran, and Sentry's startSpan was invoked.
        expect(innerHandler).toHaveBeenCalledTimes(1);
        expect(startSpanMock).toHaveBeenCalledTimes(1);
        // First arg to startSpan carries the span name; sanity-check it.
        const firstCallArgs = startSpanMock.mock.calls[0];
        expect(firstCallArgs[0]).toMatchObject({
            name: 'worker.task.checkForStuckJobs',
        });
    });

    it('handles mixed task lists — only the heartbeat name bypasses', async () => {
        const heartbeatHandler = jest.fn().mockResolvedValue(undefined);
        const regularHandler = jest.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ['workerHeartbeat:pod-xyz' as any]: heartbeatHandler,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            checkForStuckJobs: regularHandler as any,
        };

        const tracedList = traceTasks(tasks);
        await tracedList['workerHeartbeat:pod-xyz']!({}, makeHelpers());
        await tracedList.checkForStuckJobs!({}, makeHelpers());

        expect(heartbeatHandler).toHaveBeenCalledTimes(1);
        expect(regularHandler).toHaveBeenCalledTimes(1);
        // Only ONE span — for the regular task, not the heartbeat.
        expect(startSpanMock).toHaveBeenCalledTimes(1);
    });
});

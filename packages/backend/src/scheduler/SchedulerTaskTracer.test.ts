// We assert on Sentry.startSpan invocation as the marker of "this task got
// wrapped". The traced wrapper calls Sentry.startSpan each time the handler
// runs; the bypass path does not. Sentry methods are read-only on the
// module namespace, so swap them out via vi.mock instead of spyOn.
const startSpanMock = vi.fn();
const continueTraceMock = vi.fn();
const setTagsMock = vi.fn();
const setUserMock = vi.fn();
vi.mock('@sentry/node', async () => {
    const actual =
        await vi.importActual<typeof import('@sentry/node')>('@sentry/node');
    return {
        ...actual,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        continueTrace: (_ctx: unknown, cb: any) => continueTraceMock(cb),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        startSpan: (opts: unknown, cb: any) => startSpanMock(opts, cb),
        setUser: (...args: unknown[]) => setUserMock(...args),
        setTags: (...args: unknown[]) => setTagsMock(...args),
        addBreadcrumb: vi.fn(),
        captureException: vi.fn(),
        withScope: (
            cb: (s: { setFingerprint: import('vitest').Mock }) => void,
        ) => cb({ setFingerprint: vi.fn() }),
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
    (_opts: unknown, cb: any) => cb({ setStatus: vi.fn() }),
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

describe('traceTasks — wraps every task in the Sentry trace wrapper', () => {
    beforeEach(() => {
        startSpanMock.mockClear();
        setTagsMock.mockClear();
        setUserMock.mockClear();
    });

    it('wraps a regular scheduler task in Sentry.startSpan', async () => {
        const innerHandler = vi.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            checkForStuckJobs: innerHandler as any,
        };

        const tracedList = traceTasks(tasks);
        const wrappedTask = tracedList.checkForStuckJobs;

        expect(wrappedTask).toBeDefined();
        await wrappedTask!({}, makeHelpers());

        expect(innerHandler).toHaveBeenCalledTimes(1);
        expect(startSpanMock).toHaveBeenCalledTimes(1);
        const firstCallArgs = startSpanMock.mock.calls[0];
        expect(firstCallArgs[0]).toMatchObject({
            name: 'worker.task.checkForStuckJobs',
        });
    });

    it('wraps every task in a mixed list (heartbeats no longer flow through graphile)', async () => {
        // The old bypass for workerHeartbeat:<poolId> existed because that
        // task fired every 60s and produced noise. With pg-ping running
        // out-of-band, nothing in the queue needs special-casing.
        const handlerA = vi.fn().mockResolvedValue(undefined);
        const handlerB = vi.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            checkForStuckJobs: handlerA as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cleanDeploySessions: handlerB as any,
        };

        const tracedList = traceTasks(tasks);
        await tracedList.checkForStuckJobs!({}, makeHelpers());
        await tracedList.cleanDeploySessions!({}, makeHelpers());

        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).toHaveBeenCalledTimes(1);
        expect(startSpanMock).toHaveBeenCalledTimes(2);
    });

    it('sets organization.name tag when the resolver returns a name', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            compileProject: handler as any,
        };
        const resolveOrganizationName = vi.fn().mockResolvedValue('Acme Corp');

        const tracedList = traceTasks(tasks, { resolveOrganizationName });
        await tracedList.compileProject!(
            {
                organizationUuid: 'org-uuid-123',
                userUuid: 'user-uuid-456',
                projectUuid: 'project-uuid-789',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            makeHelpers(),
        );

        expect(resolveOrganizationName).toHaveBeenCalledWith('org-uuid-123');
        expect(setTagsMock).toHaveBeenCalledTimes(1);
        expect(setTagsMock.mock.calls[0][0]).toMatchObject({
            'organization.uuid': 'org-uuid-123',
            'organization.name': 'Acme Corp',
        });
    });

    it('omits organization.name tag when the resolver returns undefined', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            compileProject: handler as any,
        };
        const resolveOrganizationName = vi.fn().mockResolvedValue(undefined);

        const tracedList = traceTasks(tasks, { resolveOrganizationName });
        await tracedList.compileProject!(
            {
                organizationUuid: 'org-uuid-123',
                userUuid: 'user-uuid-456',
                projectUuid: 'project-uuid-789',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            makeHelpers(),
        );

        expect(setTagsMock).toHaveBeenCalledTimes(1);
        expect(setTagsMock.mock.calls[0][0]).toMatchObject({
            'organization.uuid': 'org-uuid-123',
        });
        expect(setTagsMock.mock.calls[0][0]).not.toHaveProperty(
            'organization.name',
        );
    });

    it('does not crash when the resolver rejects', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        const tasks: Partial<TypedTaskList> = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            compileProject: handler as any,
        };
        const resolveOrganizationName = vi
            .fn()
            .mockRejectedValue(new Error('boom'));

        const tracedList = traceTasks(tasks, { resolveOrganizationName });
        await tracedList.compileProject!(
            {
                organizationUuid: 'org-uuid-123',
                userUuid: 'user-uuid-456',
                projectUuid: 'project-uuid-789',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            makeHelpers(),
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(setTagsMock).toHaveBeenCalledTimes(1);
        expect(setTagsMock.mock.calls[0][0]).not.toHaveProperty(
            'organization.name',
        );
    });
});

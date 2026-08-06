import {
    AI_AGENT_STORAGE_SENTRY_MODULE,
    instrumentAiAgentStorage,
} from './AiAgentStorageObservability';

const { setTag, withIsolationScope } = vi.hoisted(() => ({
    setTag: vi.fn(),
    withIsolationScope: vi.fn(
        (callback: (scope: { setTag: typeof setTag }) => unknown) =>
            callback({ setTag }),
    ),
}));

vi.mock('@sentry/node', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/node')>()),
    withIsolationScope,
}));

it('instruments storage methods with one module tag', () => {
    const method = vi.fn().mockReturnValue('result');
    const instrumented = instrumentAiAgentStorage({ method });

    expect(instrumented.method()).toBe('result');
    expect(setTag).toHaveBeenCalledWith(
        'module',
        AI_AGENT_STORAGE_SENTRY_MODULE,
    );
    expect(withIsolationScope).toHaveBeenCalledOnce();
});

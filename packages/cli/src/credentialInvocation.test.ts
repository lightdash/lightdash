import { AsyncResource } from 'async_hooks';
import { Command } from 'commander';
import { registerAgentConnectionOption } from './agentConnectionOption';
import { slotFixture } from './agentConnections/fixtures';
import { LightdashAnalytics } from './analytics/analytics';
import {
    getAgentConnectionChildEnvironment,
    getAgentConnectionSelection,
    resolveCredential,
    runWithAgentConnectionSelection,
    runWithParsedAgentConnectionSelection,
} from './credentials';
import { lightdashRawApi } from './handlers/dbt/apiClient';
import {
    buildCredentialHeaders,
    buildRequestHeaders,
    getAuthHeader,
    getCredentialAuthHeader,
} from './handlers/utils';

const mocks = vi.hoisted(() => ({
    config: vi.fn(),
    fetch: vi.fn(),
    token: vi.fn(),
}));
vi.mock('./config', () => ({ getConfig: mocks.config }));
vi.mock('node-fetch', () => ({ default: mocks.fetch }));
vi.mock('./agentConnections/agentTokenProvider', () => ({
    AgentTokenProvider: class {
        getToken = mocks.token;
    },
}));
const slot = slotFixture();
const config = {
    context: { serverUrl: slot.instanceUrl, apiKey: 'ordinary-key' },
    user: {
        userUuid: slot.personUuid,
        organizationUuid: slot.organizationUuid,
    },
};
const request = () =>
    lightdashRawApi({ method: 'GET', url: '/api/v1/user', body: undefined });
const program = () => {
    const command = new Command();
    registerAgentConnectionOption(command);
    command.command('read').action(async () => {
        await request();
    });
    return command;
};
beforeEach(() => {
    vi.stubEnv('LIGHTDASH_AGENT_CONNECTION', undefined);
    mocks.config.mockReset().mockResolvedValue(config);
    mocks.token.mockReset().mockResolvedValue(slot);
    mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 200 });
});
afterEach(() => vi.unstubAllEnvs());
it('does not leak a selected action into a later direct handler call', async () => {
    await program().parseAsync(['read', '--agent-connection', slot.name], {
        from: 'user',
    });
    await request();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['Bearer private-access', 'ApiKey ordinary-key']);
    expect(getAgentConnectionSelection()).toBeNull();
});
it('clears the retained selection on a reused Commander program', async () => {
    const command = program();
    await command.parseAsync(['read', '--agent-connection', slot.name], {
        from: 'user',
    });
    await command.parseAsync(['read'], { from: 'user' });
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['Bearer private-access', 'ApiKey ordinary-key']);
});
it('keeps a selected invocation bound while an ordinary invocation completes during its await', async () => {
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
        resume = resolve;
    });
    mocks.config.mockImplementationOnce(async () => {
        await paused;
        return config;
    });
    const selected = program().parseAsync(
        ['read', '--agent-connection', slot.name],
        { from: 'user' },
    );
    await program().parseAsync(['read'], { from: 'user' });
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
        'ApiKey ordinary-key',
    );
    resume();
    await selected;
    expect(mocks.fetch.mock.calls[1][1].headers.Authorization).toBe(
        'Bearer private-access',
    );
});

it('does not leak between sequential direct handler invocations', async () => {
    await runWithAgentConnectionSelection(slot.name, request);
    await request();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['Bearer private-access', 'ApiKey ordinary-key']);
});
it('releases a failed invocation without leaking its selection', async () => {
    mocks.token.mockRejectedValueOnce(new Error('Connection unavailable'));
    const command = program();
    await expect(
        command.parseAsync(['read', '--agent-connection', slot.name], {
            from: 'user',
        }),
    ).rejects.toThrow('Connection unavailable');
    await request();
    await command.parseAsync(['read'], { from: 'user' });
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['ApiKey ordinary-key', 'ApiKey ordinary-key']);
});

const holdSelection = () => {
    let resume!: () => void;
    const pending = new Promise<void>((resolve) => {
        resume = resolve;
    });
    const running = runWithAgentConnectionSelection(slot.name, () => pending);
    return { resume, running };
};
it.each(['stored-human-key', 'env-human-key'])(
    'refuses storeless requests during a selection with %s',
    async (apiKey) => {
        mocks.config.mockResolvedValue({
            ...config,
            context: { ...config.context, apiKey },
        });
        const held = holdSelection();
        try {
            await expect(request()).rejects.toThrow(
                'cannot use your personal CLI login',
            );
            expect(mocks.fetch).not.toHaveBeenCalled();
        } finally {
            held.resume();
            await held.running;
        }
        await request();
        expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
            `ApiKey ${apiKey}`,
        );
    },
);
it('refuses storeless resolution, headers, children and analytics while selected', async () => {
    const held = holdSelection();
    try {
        await expect(resolveCredential(config)).rejects.toThrow(
            'cannot use your personal CLI login',
        );
        await expect(getAgentConnectionChildEnvironment()).rejects.toThrow(
            'cannot use your personal CLI login',
        );
        const human = { kind: 'human_api_key' as const, token: 'ordinary-key' };
        for (const action of [
            () => getAuthHeader(human.token),
            () => buildRequestHeaders(human.token),
            () => getCredentialAuthHeader(human),
            () => buildCredentialHeaders(human, null),
        ])
            expect(action).toThrow('cannot use your personal CLI login');
        await LightdashAnalytics.identify({});
        await LightdashAnalytics.track({
            event: 'stop_preview.missing',
            properties: { name: 'test' },
        });
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.config).not.toHaveBeenCalled();
    } finally {
        held.resume();
        await held.running;
    }
});
it('lets an explicitly ordinary invocation use its own credential during a selection', async () => {
    const held = holdSelection();
    try {
        await runWithAgentConnectionSelection(null, request);
        expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
            'ApiKey ordinary-key',
        );
    } finally {
        held.resume();
        await held.running;
    }
});
it.each(['success', 'rejection', 'throw'] as const)(
    'releases the selected count after %s',
    async (outcome) => {
        const action = () => {
            if (outcome === 'throw') throw new Error('fixture');
            return outcome === 'rejection'
                ? Promise.reject(new Error('fixture'))
                : Promise.resolve();
        };
        try {
            await runWithAgentConnectionSelection(slot.name, action);
        } catch (error) {
            expect(error).toEqual(new Error('fixture'));
        }
        await request();
        expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(
            'ApiKey ordinary-key',
        );
    },
);
it('keeps the guard until both overlapping selected invocations finish', async () => {
    const first = holdSelection();
    const second = holdSelection();
    first.resume();
    await first.running;
    try {
        await expect(request()).rejects.toThrow(
            'cannot use your personal CLI login',
        );
    } finally {
        second.resume();
        await second.running;
    }
    await request();
    expect(mocks.fetch).toHaveBeenCalledOnce();
});

it.each(['identify', 'track'] as const)(
    'blocks storeless analytics %s if selection starts during identity resolution',
    async (method) => {
        let resume!: () => void;
        const pending = new Promise<void>((resolve) => {
            resume = resolve;
        });
        mocks.config.mockImplementationOnce(async () => {
            await pending;
            return config;
        });
        const analytics =
            method === 'identify'
                ? LightdashAnalytics.identify({})
                : LightdashAnalytics.track({
                      event: 'stop_preview.missing',
                      properties: { name: 'test' },
                  });
        const held = holdSelection();
        try {
            resume();
            await analytics;
            expect(mocks.fetch).not.toHaveBeenCalled();
        } finally {
            held.resume();
            await held.running;
        }
    },
);
it.each([
    'legacy-auth',
    'legacy-headers',
    'typed-auth',
    'typed-headers',
    'children',
    'identify',
    'track',
])('guards the storeless %s boundary independently', async (boundary) => {
    const held = holdSelection();
    const human = { kind: 'human_api_key' as const, token: 'ordinary-key' };
    const actions: Record<string, () => unknown> = {
        'legacy-auth': () => getAuthHeader(human.token),
        'legacy-headers': () => buildRequestHeaders(human.token),
        'typed-auth': () => getCredentialAuthHeader(human),
        'typed-headers': () => buildCredentialHeaders(human, null),
        children: () => getAgentConnectionChildEnvironment(),
        identify: () => LightdashAnalytics.identify({}),
        track: () =>
            LightdashAnalytics.track({
                event: 'stop_preview.missing',
                properties: { name: 'test' },
            }),
    };
    try {
        const result = Promise.resolve().then(actions[boundary]);
        if (['identify', 'track'].includes(boundary)) await result;
        else
            await expect(result).rejects.toThrow(
                'cannot use your personal CLI login',
            );
        expect(mocks.config).not.toHaveBeenCalled();
        expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
        held.resume();
        await held.running;
    }
});

const guard =
    'An agent connection is selected for this run, so this request cannot use your personal CLI login.';
it('keeps the guard while a non-native thenable action is still pending', async () => {
    const outside = new AsyncResource('outside');
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const result = runWithAgentConnectionSelection(slot.name, () => ({
        // oxlint-disable-next-line unicorn/no-thenable
        then: pending.then.bind(pending),
    }));
    await expect(outside.runInAsyncScope(request)).rejects.toThrow(guard);
    expect(mocks.fetch).not.toHaveBeenCalled();
    finish();
    await result;
    await Promise.resolve();
    await outside.runInAsyncScope(request);
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['ApiKey ordinary-key']);
});
it('guards storeless calls before the selection is first read', async () => {
    const outside = new AsyncResource('outside');
    await expect(
        runWithParsedAgentConnectionSelection(
            () => slot.name,
            true,
            () => outside.runInAsyncScope(request),
        ),
    ).rejects.toThrow(guard);
    expect(mocks.fetch).not.toHaveBeenCalled();
});
it('guards a pre-action host hook on a flag-selected parse', async () => {
    const outside = new AsyncResource('outside');
    const command = program();
    command.hook('preSubcommand', () =>
        outside.runInAsyncScope(async () => {
            await request();
        }),
    );
    await expect(
        command.parseAsync(['--agent-connection', slot.name, 'read'], {
            from: 'user',
        }),
    ).rejects.toThrow(guard);
    expect(mocks.fetch).not.toHaveBeenCalled();
});
it('stops guarding once a possibly selected parse turns out ordinary', async () => {
    const outside = new AsyncResource('outside');
    await runWithParsedAgentConnectionSelection(
        () => null,
        true,
        async () => {
            getAgentConnectionSelection();
            await outside.runInAsyncScope(request);
        },
    );
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['ApiKey ordinary-key']);
});
it('does not block later ordinary calls when the selection is first read after return', async () => {
    let late: () => void = () => {};
    runWithParsedAgentConnectionSelection(
        () => slot.name,
        false,
        () => {
            late = AsyncResource.bind(() => {
                getAgentConnectionSelection();
            });
        },
    );
    late();
    await request();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['ApiKey ordinary-key']);
});
it('keeps the guard while a callable thenable action is still pending', async () => {
    const outside = new AsyncResource('outside');
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const result = runWithAgentConnectionSelection(slot.name, () =>
        // oxlint-disable-next-line unicorn/no-thenable
        Object.assign(() => {}, { then: pending.then.bind(pending) }),
    );
    await expect(outside.runInAsyncScope(request)).rejects.toThrow(guard);
    finish();
    await result;
    await request();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['ApiKey ordinary-key']);
});
it('releases the guard when a single-subscriber thenable settles for the caller', async () => {
    let finish: () => void = () => {};
    const result = runWithAgentConnectionSelection(slot.name, () => ({
        // oxlint-disable-next-line unicorn/no-thenable
        then(resolve: () => void) {
            finish = resolve;
        },
    }));
    await Promise.resolve();
    const done = Promise.resolve(result);
    await Promise.resolve();
    finish();
    await done;
    await request();
    expect(
        mocks.fetch.mock.calls.map(([, init]) => init.headers.Authorization),
    ).toEqual(['ApiKey ordinary-key']);
});

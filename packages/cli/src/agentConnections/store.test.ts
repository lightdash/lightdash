import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import path from 'path';
import { slotFixture } from './fixtures';
import { type AgentConnectionSlot } from './schema';
import { AgentConnectionStore } from './store';

type RawSlot = Record<string, unknown> & { tokens: Record<string, unknown> };
type RawStore = {
    future?: unknown;
    instances: Record<
        string,
        {
            organizations: Record<
                string,
                { people: Record<string, { slots: Record<string, RawSlot> }> }
            >;
        }
    >;
};
const parseStore = (contents: string): RawStore => {
    const value: unknown = yaml.load(contents);
    return value as RawStore;
};
const slotsFor = (raw: RawStore, slot: AgentConnectionSlot) =>
    raw.instances[slot.instanceUrl].organizations[slot.organizationUuid].people[
        slot.personUuid
    ].slots;

let directory: string;
let store: AgentConnectionStore;
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'agent-store-'));
    store = new AgentConnectionStore(
        path.join(directory, 'agent-connections.yaml'),
    );
});
afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});
it('reads absence without creating a file and round trips a private slot', async () => {
    const slot = slotFixture();
    expect(await store.readSlot(slot)).toBeNull();
    expect(await fs.readdir(directory)).toEqual([]);
    await store.saveSlot(slot);
    expect(await store.readSlot(slot)).toEqual(slot);
    expect((await fs.stat(store.filePath)).mode % 0o1000).toBe(0o600);
    expect((await fs.stat(directory)).mode % 0o1000).toBe(0o700);
});
it('preserves unknown fields and malformed unrelated slots across mutations', async () => {
    const slot = slotFixture();
    await store.saveSlot(slot);
    const raw = parseStore(await fs.readFile(store.filePath, 'utf8'));
    raw.future = { keep: true };
    const slots = slotsFor(raw, slot);
    slots.broken = { secret: 'recover-me', tokens: {} };
    slots.default.future = { keep: true };
    slots.default.tokens.future = 'keep';
    await fs.writeFile(store.filePath, yaml.dump(raw));
    await store.updateTokens(slot, {
        ...slot.tokens,
        accessToken: 'rotated',
        generation: 2,
    });
    await store.setRefreshState(slot, {
        kind: 'reconnect_required',
        since: new Date().toISOString(),
    });
    await store.setRevokeState(slot, {
        kind: 'unconfirmed',
        attemptedAt: new Date().toISOString(),
    });
    const saved = parseStore(await fs.readFile(store.filePath, 'utf8'));
    expect(saved.future).toEqual({ keep: true });
    expect(
        saved.instances[slot.instanceUrl].organizations[slot.organizationUuid]
            .people[slot.personUuid].slots,
    ).toMatchObject({
        broken: { secret: 'recover-me' },
        default: {
            future: { keep: true },
            tokens: { future: 'keep', accessToken: 'rotated' },
        },
    });
    await expect(store.readSlot({ ...slot, name: 'broken' })).rejects.toThrow(
        'Invalid agent connection',
    );
    await store.removeSlot(slot);
    expect(await store.readSlot(slot)).toBeNull();
});
it.each([
    (s: RawSlot) => ({ ...s, tokens: { ...s.tokens, accessToken: '' } }),
    (s: RawSlot) => ({ ...s, personUuid: 'wrong' }),
    (s: RawSlot) => ({ ...s, tokens: { ...s.tokens, generation: 0 } }),
    (s: RawSlot) => ({
        ...s,
        tokens: { ...s.tokens, refreshTokenExpiresAt: 'tomorrow' },
    }),
    (s: RawSlot) => ({
        ...s,
        tokens: {
            ...s.tokens,
            accessTokenExpiresAt: '9999-01-01T00:00:00.000Z',
        },
    }),
    (s: RawSlot) => ({ ...s, refreshState: { kind: 'other' } }),
    (s: RawSlot) =>
        Object.fromEntries(
            Object.entries(s).filter(([key]) => key !== 'grantRevision'),
        ) as RawSlot,
    (s: RawSlot) => ({ ...s, resource: 'https://elsewhere.com' }),
])(
    'rejects malformed data without repairing it or leaking secrets',
    async (mutate) => {
        const slot = slotFixture();
        await store.saveSlot(slot);
        const raw = parseStore(await fs.readFile(store.filePath, 'utf8'));
        const slots = slotsFor(raw, slot);
        slots.default = mutate(slots.default);
        const contents = yaml.dump(raw);
        await fs.writeFile(store.filePath, contents);
        await expect(store.readSlot(slot)).rejects.toThrow(
            'Invalid agent connection',
        );
        expect(await fs.readFile(store.filePath, 'utf8')).toBe(contents);
    },
);
it.each([
    'version: 999\ninstances: {}',
    'not: [valid',
    'version: 1\ninstances: []',
])(
    'rejects unreadable or future stores without rewriting',
    async (contents) => {
        await fs.writeFile(store.filePath, contents);
        await expect(store.saveSlot(slotFixture())).rejects.toThrow(
            'Invalid agent connection',
        );
        expect(await fs.readFile(store.filePath, 'utf8')).toBe(contents);
    },
);
it('serializes independent slot saves without losing either', async () => {
    const slot = slotFixture();
    await Promise.all([
        store.saveSlot(slot),
        store.saveSlot({ ...slot, name: 'second' }),
    ]);
    expect(await store.readSlot(slot)).not.toBeNull();
    expect(await store.readSlot({ ...slot, name: 'second' })).not.toBeNull();
});

it('preserves future fields inside refresh and revoke states through transitions', async () => {
    const slot = slotFixture();
    await store.saveSlot(slot);
    const raw = parseStore(await fs.readFile(store.filePath, 'utf8'));
    slotsFor(raw, slot).default.refreshState = {
        kind: 'idle',
        futureRefresh: { keep: true },
    };
    slotsFor(raw, slot).default.revokeState = {
        kind: 'none',
        futureRevoke: 'keep',
    };
    await fs.writeFile(store.filePath, yaml.dump(raw));
    await store.setRefreshState(slot, {
        kind: 'reconnect_required',
        since: new Date().toISOString(),
    });
    await store.setRevokeState(slot, {
        kind: 'unconfirmed',
        attemptedAt: new Date().toISOString(),
    });
    await store.setRefreshState(slot, { kind: 'idle' });
    await store.setRevokeState(slot, { kind: 'none' });
    const saved = slotsFor(
        parseStore(await fs.readFile(store.filePath, 'utf8')),
        slot,
    ).default;
    expect(saved.refreshState).toMatchObject({
        kind: 'idle',
        futureRefresh: { keep: true },
    });
    expect(saved.revokeState).toMatchObject({
        kind: 'none',
        futureRevoke: 'keep',
    });
});

it('checks a save precondition after preparing the file and before rename', async () => {
    const slot = slotFixture();
    await store.saveSlot(slot);
    const before = await fs.readFile(store.filePath, 'utf8');
    let cancelled = false;
    const { open } = fs;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
        const handle = await open(...args);
        if (String(args[0]).endsWith('.tmp')) {
            const sync = handle.sync.bind(handle);
            vi.spyOn(handle, 'sync').mockImplementation(async () => {
                await sync();
                cancelled = true;
            });
        }
        return handle;
    });
    try {
        await expect(
            store.saveSlot(
                { ...slot, grantUuid: '44444444-4444-4444-8444-444444444444' },
                (current) => {
                    expect(current).toEqual(slot);
                    if (cancelled) throw new Error('cancelled before commit');
                },
            ),
        ).rejects.toThrow('cancelled before commit');
        expect(await fs.readFile(store.filePath, 'utf8')).toBe(before);
    } finally {
        vi.restoreAllMocks();
    }
});
it('keeps the old refresh journal if the replacement rename fails', async () => {
    const slot = slotFixture();
    await store.saveSlot(slot);
    await store.withLock(async (locked) =>
        locked.writeJournal(slot, {
            grantUuid: slot.grantUuid,
            generation: 1,
            attemptUuid: 'attempt',
        }),
    );
    const before = await fs.readFile(store.filePath, 'utf8');
    vi.spyOn(fs, 'rename').mockRejectedValue(new Error('rename failed'));
    try {
        await expect(
            store.saveSlot({
                ...slot,
                grantUuid: '44444444-4444-4444-8444-444444444444',
            }),
        ).rejects.toThrow();
        expect(await fs.readFile(store.filePath, 'utf8')).toBe(before);
        expect(
            await store.withLock((locked) => locked.readJournal(slot)),
        ).toMatchObject({ grantUuid: slot.grantUuid });
    } finally {
        vi.restoreAllMocks();
    }
});

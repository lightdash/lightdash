import {
    PersonSignInProvider,
    type SharedSignInStatus,
} from '@lightdash/common';
import {
    acceptWarehouseSignInStatus,
    activateWarehouseSignInPreflight,
    isWarehouseSignInTargetCurrent,
    WarehouseSignInPreflight,
    WarehouseSignInStatusCache,
} from './warehouseSignInPreflight';

const identity = {
    projectUuid: 'project_a',
    userUuid: 'user_a',
    pageGeneration: 'page_a',
};
const personal = (
    binding: string | null,
    expired: boolean,
): SharedSignInStatus => ({
    personalSelection: { warehouseConnectionUuid: binding },
    provider: PersonSignInProvider.GOOGLE,
    subject: null,
    subjectBasis: null,
    expired: false,
    canReconnect: false,
    personalSignIn: {
        projectUuid: identity.projectUuid,
        provider: PersonSignInProvider.GOOGLE,
        userWarehouseCredentialsUuid: 'credential_a',
        expired,
        canReconnect: true,
    },
});
const shared: SharedSignInStatus = {
    provider: PersonSignInProvider.GOOGLE,
    subject: null,
    subjectBasis: null,
    expired: true,
    canReconnect: true,
};
const create = (
    overrides: Partial<typeof identity> = {},
    cache = new WarehouseSignInStatusCache(),
) =>
    new WarehouseSignInPreflight(
        { ...identity, ...overrides },
        true,
        false,
        cache,
    );

afterEach(() => vi.restoreAllMocks());

test.each([{ userUuid: 'user_b' }, { projectUuid: 'project_b' }])(
    'rejects a target from a different identity with equal page and request generations: %j',
    (different) => {
        const previous = create();
        previous.register('source_a', null, 1);
        previous.settle(null, 1, personal(null, true));
        const target = previous.target!;
        const current = create(different);
        current.register('source_a', null, 1);
        current.settle(null, 1, personal(null, true));
        expect(current.isCurrent(target)).toBe(false);
        const deactivate = activateWarehouseSignInPreflight(current);
        expect(isWarehouseSignInTargetCurrent(target)).toBe(false);
        expect(isWarehouseSignInTargetCurrent(current.target!)).toBe(true);
        expect(isWarehouseSignInTargetCurrent({ ...current.target! })).toBe(
            false,
        );
        current.dismiss(target);
        expect(current.modalOpen).toBe(true);
        current.restored(target);
        expect(current.modalOpen).toBe(true);
        deactivate();
    },
);

test('pending selection never registers original and a stale A response cannot settle a later A selection', () => {
    const store = create();
    expect(store.ready(undefined)).toBe(false);
    expect(store.checks.size).toBe(0);
    const keepSibling = store.register('sibling', 'connection_a', 0);
    const releaseA = store.register('sql', 'connection_a', 1);
    const oldGeneration = store.checks.get('connection_a')!.generation;
    releaseA();
    const releaseB = store.register('sql', 'connection_b', 1);
    releaseB();
    store.register('sql', 'connection_a', 1);
    const current = store.checks.get('connection_a')!;
    expect(current.generation).not.toBe(oldGeneration);
    expect(current.forceRefresh).toBe(true);
    expect(
        store.settle(
            'connection_a',
            oldGeneration,
            personal('connection_a', true),
        ),
    ).toBe(false);
    expect(store.ready('connection_a')).toBe(false);
    expect(store.target).toBeNull();
    store.settle(
        'connection_a',
        current.generation,
        personal('connection_a', false),
    );
    expect(store.ready('connection_a')).toBe(true);
    keepSibling();
});

test('a healthy sibling cannot clear an expired target, and dismissal releases every binding without a modal queue', () => {
    const store = create();
    store.register('first', 'connection_a', 0);
    store.register('second', null, 0);
    store.register('third', 'connection_b', 0);
    store.settle(
        'connection_a',
        store.checks.get('connection_a')!.generation,
        personal('connection_a', true),
    );
    store.settle(
        null,
        store.checks.get('original')!.generation,
        personal(null, false),
    );
    store.settle(
        'connection_b',
        store.checks.get('connection_b')!.generation,
        personal('connection_b', true),
    );
    const target = store.target!;
    expect(target.binding).toBe('connection_a');
    store.settle(
        null,
        store.checks.get('original')!.generation,
        personal(null, false),
    );
    expect(store.target).toBe(target);
    store.dismiss(target);
    expect(store.ready('connection_a')).toBe(true);
    expect(store.ready('connection_b')).toBe(true);
    store.settle('connection_a', target.generation, {
        ...personal('connection_a', false),
        statusUnknown: true,
    });
    expect(store.target).toBe(target);
    store.settle('connection_a', target.generation, null);
    expect(store.target).toBe(target);
    store.restored(target);
    expect(store.target).toBeNull();
    expect(store.modalOpen).toBe(false);
});

test('rejects old opt-in-unaware shared status for proactive original, extra, and personal verification paths', () => {
    expect(acceptWarehouseSignInStatus(shared, null)).toBeNull();
    expect(acceptWarehouseSignInStatus(shared, 'connection_a')).toBeNull();
    expect(
        acceptWarehouseSignInStatus(shared, 'connection_a', true),
    ).toBeNull();
    expect(acceptWarehouseSignInStatus(shared, null, true)).toBe(shared);
    expect(
        acceptWarehouseSignInStatus(
            {
                ...shared,
                personalSelection: { warehouseConnectionUuid: 'connection_a' },
            },
            'connection_a',
        ),
    ).toBeNull();
    expect(
        acceptWarehouseSignInStatus(personal(null, true), 'connection_a'),
    ).toBeNull();
    expect(
        acceptWarehouseSignInStatus(
            personal('connection_a', true),
            'connection_a',
        ),
    ).toEqual(personal('connection_a', true));
});

test('shares status requests across pages during the cooldown, checks a new binding immediately, and rechecks at its end', async () => {
    const cache = new WarehouseSignInStatusCache();
    const request = vi.fn(async () => shared);
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    await cache.fetch(identity, null, 1, request);
    await cache.fetch(
        { ...identity, pageGeneration: 'page_b' },
        null,
        1,
        request,
    );
    expect(request).toHaveBeenCalledOnce();
    await cache.fetch(
        { ...identity, pageGeneration: 'page_b' },
        'connection_a',
        1,
        request,
    );
    expect(request).toHaveBeenCalledTimes(2);
    now.mockReturnValue(160_001);
    await cache.fetch(
        { ...identity, pageGeneration: 'page_c' },
        null,
        1,
        request,
    );
    expect(request).toHaveBeenCalledTimes(3);
});

test('a same-page selection return bypasses old in-flight status but a different viewer never joins it', async () => {
    const cache = new WarehouseSignInStatusCache();
    const pending = Promise.withResolvers<SharedSignInStatus>();
    const request = vi.fn(() => pending.promise);
    const first = cache.fetch(identity, 'connection_a', 1, request);
    const second = cache.fetch(identity, 'connection_a', 3, request, true);
    expect(first).toBe(pending.promise);
    expect(second).toBe(pending.promise);
    expect(request).toHaveBeenCalledTimes(2);
    const otherViewer = cache.fetch(
        { ...identity, userUuid: 'user_b' },
        'connection_a',
        3,
        request,
    );
    expect(request).toHaveBeenCalledTimes(3);
    pending.resolve(shared);
    await Promise.all([first, second, otherViewer]);
});

test('shared automatic modal policy persists across pages while personal binding checks remain independent', () => {
    const cache = new WarehouseSignInStatusCache();
    const first = create({}, cache);
    first.register('source', null, 1);
    first.settle(null, 1, {
        ...shared,
        personalSelection: { warehouseConnectionUuid: null },
    });
    expect(first.modalOpen).toBe(true);
    first.dismiss(first.target!);
    const second = create({ pageGeneration: 'page_b' }, cache);
    second.register('source', null, 1);
    second.settle(null, 1, {
        ...shared,
        personalSelection: { warehouseConnectionUuid: null },
    });
    expect(second.target?.binding).toBeNull();
    expect(second.modalOpen).toBe(false);
    const third = create({ pageGeneration: 'page_c' }, cache);
    third.register('source', 'connection_a', 1);
    third.settle('connection_a', 1, personal('connection_a', true));
    expect(third.modalOpen).toBe(true);
});

test('an explicit new selection can recover after a repair without opening a queued sibling', () => {
    const store = create();
    store.register('sibling', 'connection_b', 0);
    const release = store.register('sql', 'connection_a', 1);
    store.settle(
        'connection_b',
        store.checks.get('connection_b')!.generation,
        personal('connection_b', true),
    );
    store.settle(
        'connection_a',
        store.checks.get('connection_a')!.generation,
        personal('connection_a', true),
    );
    const first = store.target!;
    expect(first.binding).toBe('connection_a');
    store.restored(first);
    expect(store.target).toBeNull();
    expect(store.modalOpen).toBe(false);
    release();
    store.register('sql', 'connection_b', 1);
    store.settle(
        'connection_b',
        store.checks.get('connection_b')!.generation,
        personal('connection_b', true),
    );
    expect(store.target?.binding).toBe('connection_b');
    expect(store.modalOpen).toBe(true);
});

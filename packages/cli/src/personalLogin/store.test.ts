import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loginFixture } from './fixtures';
import { personalInstanceKey } from './instanceKey';
import { PersonalLoginStore } from './store';

let directory: string;
let store: PersonalLoginStore;
const instance = 'https://example.com';
beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'personal-login-'));
    store = new PersonalLoginStore(
        path.join(directory, 'personal-logins.yaml'),
    );
});
afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});
it('saves validated records atomically with private permissions', async () => {
    const login = loginFixture();
    await store.save(`${instance}/`, login);
    const contents = await fs.readFile(store.filePath, 'utf8');
    const rename = vi.spyOn(fs, 'rename');
    try {
        rename.mockRejectedValueOnce(new Error('write failed'));
        await expect(
            store.save(instance, { ...login, personUuid: randomUUID() }),
        ).rejects.toThrow('write failed');
        expect(await fs.readFile(store.filePath, 'utf8')).toBe(contents);
    } finally {
        rename.mockRestore();
    }
    expect(await store.read(instance)).toEqual(login);
    expect((await fs.stat(store.filePath)).mode % 0o1000).toBe(0o600);
    expect((await fs.stat(directory)).mode % 0o1000).toBe(0o700);
    expect(await fs.readdir(directory)).toEqual(['personal-logins.yaml']);
});
it('serializes updates under the store lock', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let entered = () => {};
    const ready = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const first = store.withLock(async () => {
        entered();
        await gate;
    });
    await ready;
    let secondEntered = false;
    const second = store.withLock(async () => {
        secondEntered = true;
    });
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
    });
    expect(secondEntered).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(secondEntered).toBe(true);
});
it('writes and clears a private refresh journal', async () => {
    await store.withLock(async (locked) => {
        const journal = { attemptUuid: randomUUID(), generation: 1 };
        expect(await locked.readJournal(instance)).toBeNull();
        await locked.writeJournal(instance, journal);
        expect(await locked.readJournal(instance)).toEqual(journal);
        const file = (await fs.readdir(directory)).find((name) =>
            name.endsWith('.journal'),
        )!;
        expect((await fs.stat(path.join(directory, file))).mode % 0o1000).toBe(
            0o600,
        );
        await locked.clearJournal(instance);
        expect(await locked.readJournal(instance)).toBeNull();
    });
});
it.each(['generation: 0', 'accessToken: null', 'scopes: []'])(
    'rejects a tampered record: %s',
    async (change) => {
        await store.save(instance, loginFixture());
        const contents = await fs.readFile(store.filePath, 'utf8');
        let tampered: string;
        if (change.startsWith('generation'))
            tampered = contents.replace('generation: 1', change);
        else if (change.startsWith('accessToken'))
            tampered = contents.replace('accessToken: personal-access', change);
        else
            tampered = contents.replace(
                /scopes:\n\s+- read\n\s+- write/,
                change,
            );
        expect(tampered).not.toBe(contents);
        await fs.writeFile(store.filePath, tampered);
        await expect(store.read(instance)).rejects.toThrow(
            'Invalid personal login data',
        );
    },
);

it.each([
    ['https://EXAMPLE.com:443/', 'https://example.com'],
    ['http://INTERNAL.example:80/', 'http://internal.example'],
    ['http://INTERNAL.example:8080/', 'http://internal.example:8080'],
    ['https://example.com:8443', 'https://example.com:8443'],
])(
    'keys personal records and journals by %s as %s',
    async (input, expected) => {
        expect(personalInstanceKey(input)).toBe(expected);
        const login = loginFixture();
        await store.save(input, login);
        expect(await store.read(expected)).toEqual(login);
        await store.withLock(async (locked) => {
            const journal = { attemptUuid: randomUUID(), generation: 1 };
            await locked.writeJournal(input, journal);
            expect(await locked.readJournal(expected)).toEqual(journal);
            await locked.clearJournal(expected);
            await locked.remove(input);
        });
        expect(await store.read(expected)).toBeNull();
    },
);
it.each([
    'ftp://example.com',
    'https://example.com/path',
    'https://example.com/path/..',
    'https://@example.com',
    ' https://example.com',
    'https://example.com//',
    'https://example.com?query=1',
    'https://example.com?',
    'https://example.com#fragment',
    'https://example.com#',
    'https://user:password@example.com',
    'not a URL',
])('rejects an invalid personal instance URL %s', (input) => {
    expect(() => personalInstanceKey(input)).toThrow(
        'Invalid personal login instance URL.',
    );
});

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loginFixture } from './fixtures';
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

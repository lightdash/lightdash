import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';
import {
    acquireLock,
    atomicWrite,
    isFsError,
    privateDirectory,
    readPrivateFile,
} from '../agentConnections/configLock';
import { canonicalInstanceUrl } from '../agentConnections/schema';
import { configFilePath } from '../config';
import {
    invalidLogin,
    validatePersonalLogin,
    type PersonalLogin,
} from './schema';

export type RefreshJournal = { attemptUuid: string; generation: number };
export type LockedPersonalLoginStore = {
    read: (instanceUrl: string) => Promise<PersonalLogin | null>;
    save: (instanceUrl: string, login: PersonalLogin) => Promise<void>;
    remove: (instanceUrl: string) => Promise<void>;
    readJournal: (instanceUrl: string) => Promise<RefreshJournal | null>;
    writeJournal: (
        instanceUrl: string,
        journal: RefreshJournal,
    ) => Promise<void>;
    clearJournal: (instanceUrl: string) => Promise<void>;
};
export class PersonalLoginStore {
    constructor(
        public readonly filePath: string = path.join(
            path.dirname(configFilePath),
            'personal-logins.yaml',
        ),
    ) {}

    private async readRoot(): Promise<Map<string, PersonalLogin>> {
        const contents = await readPrivateFile(this.filePath);
        if (contents === null) return new Map();
        try {
            const root: unknown = yaml.load(contents);
            if (
                typeof root !== 'object' ||
                root === null ||
                !('version' in root) ||
                root.version !== 1 ||
                !('instances' in root) ||
                typeof root.instances !== 'object' ||
                root.instances === null ||
                Array.isArray(root.instances) ||
                Object.keys(root).some(
                    (key) => !['version', 'instances'].includes(key),
                )
            )
                throw invalidLogin();
            return new Map(
                Object.entries(root.instances).map(([url, login]) => {
                    if (canonicalInstanceUrl(url) !== url) throw invalidLogin();
                    return [url, validatePersonalLogin(login)];
                }),
            );
        } catch {
            throw invalidLogin();
        }
    }

    async read(instanceUrl: string): Promise<PersonalLogin | null> {
        return (
            (await this.readRoot()).get(canonicalInstanceUrl(instanceUrl)) ??
            null
        );
    }

    private journalPath(instanceUrl: string): string {
        const hash = createHash('sha256')
            .update(canonicalInstanceUrl(instanceUrl))
            .digest('hex');
        return `${this.filePath}.${hash}.journal`;
    }

    async withLock<T>(
        callback: (locked: LockedPersonalLoginStore) => Promise<T>,
    ): Promise<T> {
        await privateDirectory(path.dirname(this.filePath));
        const release = await acquireLock(`${this.filePath}.lock`);
        const writeRoot = async (root: Map<string, PersonalLogin>) =>
            atomicWrite(
                this.filePath,
                yaml.dump({ version: 1, instances: Object.fromEntries(root) }),
            );
        try {
            return await callback({
                read: (url) => this.read(url),
                save: async (url, login) => {
                    const root = await this.readRoot();
                    root.set(
                        canonicalInstanceUrl(url),
                        validatePersonalLogin(login),
                    );
                    await writeRoot(root);
                },
                remove: async (url) => {
                    const root = await this.readRoot();
                    if (root.delete(canonicalInstanceUrl(url)))
                        await writeRoot(root);
                },
                readJournal: async (url) => {
                    const contents = await readPrivateFile(
                        this.journalPath(url),
                    );
                    if (contents === null) return null;
                    try {
                        const journal: unknown = JSON.parse(contents);
                        if (
                            typeof journal !== 'object' ||
                            journal === null ||
                            !('attemptUuid' in journal) ||
                            typeof journal.attemptUuid !== 'string' ||
                            !/^[a-f0-9-]{36}$/i.test(journal.attemptUuid) ||
                            !('generation' in journal) ||
                            typeof journal.generation !== 'number' ||
                            !Number.isSafeInteger(journal.generation) ||
                            journal.generation < 1
                        )
                            throw invalidLogin();
                        return {
                            attemptUuid: journal.attemptUuid,
                            generation: journal.generation,
                        };
                    } catch {
                        throw invalidLogin();
                    }
                },
                writeJournal: (url, journal) =>
                    atomicWrite(this.journalPath(url), JSON.stringify(journal)),
                clearJournal: async (url) => {
                    await fs
                        .unlink(this.journalPath(url))
                        .catch((error: unknown) => {
                            if (!isFsError(error, 'ENOENT'))
                                throw new Error(
                                    'Cannot clear the personal login refresh journal.',
                                );
                        });
                },
            });
        } finally {
            await release();
        }
    }

    async save(instanceUrl: string, login: PersonalLogin): Promise<void> {
        await this.withLock(async (locked) => {
            await locked.save(instanceUrl, login);
            await locked.clearJournal(instanceUrl);
        });
    }

    async remove(instanceUrl: string): Promise<void> {
        await this.withLock(async (locked) => {
            await locked.remove(instanceUrl);
            await locked.clearJournal(instanceUrl);
        });
    }
}

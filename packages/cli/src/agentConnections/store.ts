import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';
import { configFilePath } from '../config';
import {
    acquireLock,
    atomicWrite,
    isFsError,
    readPrivateFile,
} from './configLock';
import {
    invalidConnection,
    validateSlot,
    type AgentConnectionSlot,
    type SlotKey,
} from './schema';

export const getAgentConnectionsFilePath = (): string =>
    path.join(path.dirname(configFilePath), 'agent-connections.yaml');
const record = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw invalidConnection();
    return Object.fromEntries(Object.entries(value));
};
const own = (value: Record<string, unknown>, key: string): unknown =>
    Object.hasOwn(value, key) ? value[key] : undefined;
const descend = (
    parent: Record<string, unknown>,
    key: string,
    create: boolean,
): Record<string, unknown> | null => {
    const value = own(parent, key);
    if (value === undefined && !create) return null;
    const child = value === undefined ? {} : record(value);
    Object.defineProperty(parent, key, {
        value: child,
        enumerable: true,
        configurable: true,
        writable: true,
    });
    return child;
};
const slotsFor = (
    root: Record<string, unknown>,
    key: SlotKey,
    create: boolean,
): Record<string, unknown> | null => {
    let node: Record<string, unknown> | null = root;
    for (const part of [
        'instances',
        key.instanceUrl,
        'organizations',
        key.organizationUuid,
        'people',
        key.personUuid,
        'slots',
    ]) {
        node = descend(node, part, create);
        if (node === null) return null;
    }
    return node;
};
export type RefreshJournal = {
    grantUuid: string;
    attemptUuid: string;
    generation: number;
};
export type LockedStore = {
    readSlot: (key: SlotKey) => Promise<AgentConnectionSlot | null>;
    saveSlot: (slot: AgentConnectionSlot) => Promise<void>;
    readJournal: (key: SlotKey) => Promise<RefreshJournal | null>;
    writeJournal: (key: SlotKey, journal: RefreshJournal) => Promise<void>;
    clearJournal: (key: SlotKey) => Promise<void>;
};

export class AgentConnectionStore {
    constructor(
        public readonly filePath: string = getAgentConnectionsFilePath(),
    ) {}

    private async readRoot(): Promise<Record<string, unknown>> {
        const contents = await readPrivateFile(this.filePath);
        if (contents === null) return { version: 1, instances: {} };
        try {
            const value: unknown = yaml.load(contents);
            const root = record(value);
            if (own(root, 'version') !== 1) throw invalidConnection();
            record(own(root, 'instances'));
            return root;
        } catch {
            throw invalidConnection();
        }
    }

    async readSlot(key: SlotKey): Promise<AgentConnectionSlot | null> {
        const slots = slotsFor(await this.readRoot(), key, false);
        const slot = slots === null ? undefined : own(slots, key.name);
        return slot === undefined ? null : validateSlot(slot, key);
    }

    private async saveUnlocked(slot: AgentConnectionSlot): Promise<void> {
        validateSlot(slot, slot);
        const root = await this.readRoot();
        const slots = slotsFor(root, slot, true);
        if (slots === null) throw invalidConnection();
        const existing = own(slots, slot.name);
        const previous = existing === undefined ? {} : record(existing);
        const merged = {
            ...previous,
            ...slot,
            tokens: {
                ...(own(previous, 'tokens') === undefined
                    ? {}
                    : record(previous.tokens)),
                ...slot.tokens,
            },
            lastReported: {
                ...(own(previous, 'lastReported') === undefined
                    ? {}
                    : record(previous.lastReported)),
                ...slot.lastReported,
            },
        };
        Object.defineProperty(slots, slot.name, {
            value: merged,
            enumerable: true,
            configurable: true,
            writable: true,
        });
        await atomicWrite(this.filePath, yaml.dump(root));
    }

    private journalPath(key: SlotKey): string {
        const hash = createHash('sha256')
            .update(
                JSON.stringify([
                    key.instanceUrl,
                    key.organizationUuid,
                    key.personUuid,
                    key.name,
                ]),
            )
            .digest('hex');
        return `${this.filePath}.${hash}.journal`;
    }

    async withLock<T>(
        callback: (locked: LockedStore) => Promise<T>,
    ): Promise<T> {
        const release = await acquireLock(`${this.filePath}.lock`);
        try {
            return await callback({
                readSlot: (key) => this.readSlot(key),
                saveSlot: (slot) => this.saveUnlocked(slot),
                readJournal: async (key) => {
                    const contents = await readPrivateFile(
                        this.journalPath(key),
                    );
                    if (contents === null) return null;
                    try {
                        const value: unknown = JSON.parse(contents);
                        const journal = record(value);
                        if (
                            typeof journal.grantUuid !== 'string' ||
                            typeof journal.attemptUuid !== 'string' ||
                            typeof journal.generation !== 'number' ||
                            !Number.isSafeInteger(journal.generation) ||
                            journal.generation < 1
                        )
                            throw invalidConnection();
                        return {
                            grantUuid: journal.grantUuid,
                            attemptUuid: journal.attemptUuid,
                            generation: journal.generation,
                        };
                    } catch {
                        throw new Error(
                            'Interrupted agent connection refresh. Reconnect before using this slot.',
                        );
                    }
                },
                writeJournal: async (key, journal) =>
                    atomicWrite(this.journalPath(key), JSON.stringify(journal)),
                clearJournal: async (key) => {
                    await fs
                        .unlink(this.journalPath(key))
                        .catch((error: unknown) => {
                            if (!isFsError(error, 'ENOENT'))
                                throw new Error(
                                    'Cannot clear the agent connection refresh journal.',
                                );
                        });
                },
            });
        } finally {
            await release();
        }
    }

    async saveSlot(slot: AgentConnectionSlot): Promise<void> {
        await this.withLock(async (locked) => {
            const previous = await locked.readSlot(slot);
            await locked.saveSlot(slot);
            if (previous && previous.grantUuid !== slot.grantUuid)
                await locked.clearJournal(slot);
        });
    }

    private async update(
        key: SlotKey,
        change: (slot: AgentConnectionSlot) => AgentConnectionSlot,
    ): Promise<void> {
        await this.withLock(async (locked) => {
            const slot = await locked.readSlot(key);
            if (!slot)
                throw new Error(
                    'Agent connection not found. Reconnect before using this slot.',
                );
            await locked.saveSlot(change(slot));
        });
    }

    async updateTokens(
        key: SlotKey,
        tokens: AgentConnectionSlot['tokens'],
    ): Promise<void> {
        await this.update(key, (slot) => ({
            ...slot,
            tokens: { ...slot.tokens, ...tokens },
        }));
    }
    async setRefreshState(
        key: SlotKey,
        refreshState: AgentConnectionSlot['refreshState'],
    ): Promise<void> {
        await this.update(key, (slot) => ({ ...slot, refreshState }));
    }
    async setRevokeState(
        key: SlotKey,
        revokeState: AgentConnectionSlot['revokeState'],
    ): Promise<void> {
        await this.update(key, (slot) => ({ ...slot, revokeState }));
    }
    async removeSlot(key: SlotKey): Promise<void> {
        await this.withLock(async () => {
            const root = await this.readRoot();
            const slots = slotsFor(root, key, false);
            if (slots && Object.hasOwn(slots, key.name)) {
                delete slots[key.name];
                await atomicWrite(this.filePath, yaml.dump(root));
            }
        });
    }
}

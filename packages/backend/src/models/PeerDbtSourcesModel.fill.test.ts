import { type Knex } from 'knex';
import Logger from '../logging/logger';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import {
    getPeerDbtSourcesEnabled,
    withPeerDbtSourcesOperation,
} from '../utils/peerDbtSourcesOperation';
import { PeerDbtSourcesModel } from './PeerDbtSourcesModel';

describe('repository fill operation boundaries', () => {
    const database = vi.fn(() => {
        throw new Error('Synthetic database unavailable');
    });
    const transaction = vi.fn(async () => {
        throw new Error('Synthetic transaction unavailable');
    });
    const encryptionUtil = {} as EncryptionUtil;
    const makeModel = (peerDbtSourcesEnabled?: boolean) =>
        new PeerDbtSourcesModel({
            database: Object.assign(database, {
                transaction,
            }) as unknown as Knex,
            encryptionUtil,
            peerDbtSourcesEnabled,
        });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('defaults to disabled without a model flag lookup or database access', async () => {
        const model = makeModel();
        expect(await model.isEnabled('synthetic-project')).toBe(false);
        await model.ensureRepositories('synthetic-project');
        expect(database).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    test('keeps the outer operation flag through nested operations and async calls', async () => {
        const model = makeModel();
        await withPeerDbtSourcesOperation(false, async () => {
            expect(await model.isEnabled('synthetic-project')).toBe(false);
            await withPeerDbtSourcesOperation(true, async () => {
                await Promise.resolve();
                expect(await model.isEnabled('synthetic-project')).toBe(false);
                await model.ensureRepositories('synthetic-project');
            });
        });
        await withPeerDbtSourcesOperation(true, async () => {
            expect(await model.isEnabled('synthetic-project')).toBe(true);
        });
        expect(getPeerDbtSourcesEnabled()).toBe(false);
        expect(database).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    test('isolates flags between concurrent operations', async () => {
        const model = makeModel();
        const enabled = withPeerDbtSourcesOperation(true, async () => {
            await Promise.resolve();
            return model.isEnabled('synthetic-project');
        });
        const disabled = withPeerDbtSourcesOperation(false, async () => {
            await Promise.resolve();
            return model.isEnabled('synthetic-project');
        });
        expect(await Promise.all([enabled, disabled])).toEqual([true, false]);
    });

    test('supports an explicit model test override', async () => {
        expect(await makeModel(true).isEnabled('synthetic-project')).toBe(true);
        expect(await makeModel(false).isEnabled('synthetic-project')).toBe(
            false,
        );
        expect(database).not.toHaveBeenCalled();
    });

    test('a failed name barrier and candidate read never reject a read-time fill', async () => {
        const info = vi.spyOn(Logger, 'info');
        await expect(
            makeModel(true).ensureRepositories('synthetic-project'),
        ).resolves.toBeUndefined();
        expect(transaction).toHaveBeenCalledOnce();
        expect(database).toHaveBeenCalledOnce();
        expect(info).toHaveBeenCalledWith('peer_dbt_source_repository_fill', {
            projectUuid: 'synthetic-project',
            sourceUuid: null,
            outcome: 'failed',
            stateRecorded: false,
        });
        expect(JSON.stringify(info.mock.calls)).not.toContain(
            'Synthetic database unavailable',
        );
        expect(JSON.stringify(info.mock.calls)).not.toContain(
            'Synthetic transaction unavailable',
        );
    });
});

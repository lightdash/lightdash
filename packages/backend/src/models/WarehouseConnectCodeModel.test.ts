import { Knex } from 'knex';
import { WarehouseConnectCodeModel } from './WarehouseConnectCodeModel';

const organizationUuid = '11111111-1111-4111-8111-111111111111';
const userUuid = '22222222-2222-4222-8222-222222222222';
const expiresAt = new Date('2026-07-15T12:15:00.000Z');
const usedAt = new Date('2026-07-15T12:01:00.000Z');
const encryptedCredentials = Buffer.from('encrypted-credentials');

const dbRow = {
    warehouse_connect_code_uuid: '33333333-3333-4333-8333-333333333333',
    code_hash: 'hashed-code',
    organization_uuid: organizationUuid,
    created_by_user_uuid: userUuid,
    expires_at: expiresAt,
    used_at: usedAt,
    encrypted_credentials: encryptedCredentials,
    created_at: new Date('2026-07-15T12:00:00.000Z'),
};

describe('WarehouseConnectCodeModel', () => {
    it('deletes prior codes for the user and expired codes when creating a code', async () => {
        const deleteBuilder = {
            where: vi.fn(),
            orWhere: vi.fn(),
            delete: vi.fn(async () => 1),
        };
        deleteBuilder.where.mockReturnValue(deleteBuilder);
        deleteBuilder.orWhere.mockReturnValue(deleteBuilder);
        const insert = vi.fn(async () => [dbRow]);
        const trx = vi
            .fn()
            .mockReturnValueOnce(deleteBuilder)
            .mockReturnValueOnce({ insert });
        const database = {
            transaction: vi.fn(
                async (callback: (value: typeof trx) => unknown) =>
                    callback(trx),
            ),
            fn: { now: vi.fn(() => 'database-now') },
        } as unknown as Knex;
        const model = new WarehouseConnectCodeModel({ database });

        await model.create({
            codeHash: 'hashed-code',
            organizationUuid,
            createdByUserUuid: userUuid,
            expiresAt,
        });

        expect(deleteBuilder.where).toHaveBeenCalledWith(
            'created_by_user_uuid',
            userUuid,
        );
        expect(deleteBuilder.orWhere).toHaveBeenCalledWith(
            'expires_at',
            '<=',
            'database-now',
        );
        expect(deleteBuilder.delete).toHaveBeenCalledOnce();
        expect(insert).toHaveBeenCalledWith({
            code_hash: 'hashed-code',
            organization_uuid: organizationUuid,
            created_by_user_uuid: userUuid,
            expires_at: expiresAt,
        });
    });

    it('consumes an unused unexpired code and stores credentials atomically', async () => {
        const now = vi.fn(() => 'database-now');
        const builder = {
            where: vi.fn(),
            whereNull: vi.fn(),
            update: vi.fn(),
            returning: vi.fn(async () => [dbRow]),
        };
        builder.where.mockReturnValue(builder);
        builder.whereNull.mockReturnValue(builder);
        builder.update.mockReturnValue(builder);
        const database = Object.assign(
            vi.fn(() => builder),
            {
                fn: { now },
            },
        ) as unknown as Knex;
        const model = new WarehouseConnectCodeModel({ database });

        await expect(
            model.consumeForDeposit('hashed-code', encryptedCredentials),
        ).resolves.toEqual({
            organizationUuid,
            createdByUserUuid: userUuid,
            expiresAt,
            usedAt,
            encryptedCredentials,
        });
        expect(builder.where).toHaveBeenCalledWith('code_hash', 'hashed-code');
        expect(builder.whereNull).toHaveBeenCalledWith('used_at');
        expect(builder.where).toHaveBeenCalledWith(
            'expires_at',
            '>',
            'database-now',
        );
        expect(builder.update).toHaveBeenCalledWith({
            used_at: 'database-now',
            encrypted_credentials: encryptedCredentials,
        });
        expect(builder.returning).toHaveBeenCalledWith('*');
    });

    it('returns null when an atomic consume does not update a row', async () => {
        const builder = {
            where: vi.fn(),
            whereNull: vi.fn(),
            update: vi.fn(),
            returning: vi.fn(async () => []),
        };
        builder.where.mockReturnValue(builder);
        builder.whereNull.mockReturnValue(builder);
        builder.update.mockReturnValue(builder);
        const database = Object.assign(
            vi.fn(() => builder),
            {
                fn: { now: vi.fn(() => 'database-now') },
            },
        ) as unknown as Knex;
        const model = new WarehouseConnectCodeModel({ database });

        await expect(
            model.consumeForDeposit('hashed-code', encryptedCredentials),
        ).resolves.toBeNull();
    });

    it('finds an unexpired code for claim', async () => {
        const builder = {
            where: vi.fn(),
            first: vi.fn(async () => dbRow),
        };
        builder.where.mockReturnValue(builder);
        const database = Object.assign(
            vi.fn(() => builder),
            {
                fn: { now: vi.fn(() => 'database-now') },
            },
        ) as unknown as Knex;
        const model = new WarehouseConnectCodeModel({ database });

        await expect(
            model.findDepositedForClaim('hashed-code'),
        ).resolves.toEqual({
            organizationUuid,
            createdByUserUuid: userUuid,
            expiresAt,
            usedAt,
            encryptedCredentials,
        });
        expect(builder.where).toHaveBeenCalledWith('code_hash', 'hashed-code');
        expect(builder.where).toHaveBeenCalledWith(
            'expires_at',
            '>',
            'database-now',
        );
    });

    it('deletes expired codes without returning them', async () => {
        const builder = {
            where: vi.fn(),
            delete: vi.fn(async () => 2),
        };
        builder.where.mockReturnValue(builder);
        const database = Object.assign(
            vi.fn(() => builder),
            {
                fn: { now: vi.fn(() => 'database-now') },
            },
        ) as unknown as Knex;
        const model = new WarehouseConnectCodeModel({ database });

        await expect(model.deleteExpired()).resolves.toBe(2);
        expect(builder.where).toHaveBeenCalledWith(
            'expires_at',
            '<=',
            'database-now',
        );
        expect(builder.delete).toHaveBeenCalledOnce();
    });
});

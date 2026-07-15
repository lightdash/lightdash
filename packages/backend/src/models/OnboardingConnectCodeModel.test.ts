import { Knex } from 'knex';
import { OnboardingConnectCodeModel } from './OnboardingConnectCodeModel';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const userUuid = '22222222-2222-4222-8222-222222222222';
const expiresAt = new Date('2026-07-14T12:15:00.000Z');

const dbRow = {
    onboarding_connect_code_uuid: '33333333-3333-4333-8333-333333333333',
    code_hash: 'hashed-code',
    project_uuid: projectUuid,
    created_by_user_uuid: userUuid,
    expires_at: expiresAt,
    used_at: new Date('2026-07-14T12:01:00.000Z'),
    created_at: new Date('2026-07-14T12:00:00.000Z'),
};

describe('OnboardingConnectCodeModel', () => {
    it('invalidates prior unused codes when minting a new code', async () => {
        const deleteBuilder = {
            where: vi.fn(),
            whereNull: vi.fn(),
            delete: vi.fn(async () => 1),
        };
        deleteBuilder.where.mockReturnValue(deleteBuilder);
        deleteBuilder.whereNull.mockReturnValue(deleteBuilder);
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
        } as unknown as Knex;
        const model = new OnboardingConnectCodeModel({ database });

        await model.create({
            codeHash: 'hashed-code',
            projectUuid,
            createdByUserUuid: userUuid,
            expiresAt,
        });

        expect(deleteBuilder.where).toHaveBeenCalledWith(
            'project_uuid',
            projectUuid,
        );
        expect(deleteBuilder.whereNull).toHaveBeenCalledWith('used_at');
        expect(deleteBuilder.delete).toHaveBeenCalledOnce();
        expect(insert).toHaveBeenCalledWith({
            code_hash: 'hashed-code',
            project_uuid: projectUuid,
            created_by_user_uuid: userUuid,
            expires_at: expiresAt,
        });
    });

    it('consumes an unused unexpired code atomically', async () => {
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
        const model = new OnboardingConnectCodeModel({ database });

        await expect(model.consume('hashed-code')).resolves.toEqual({
            projectUuid,
            createdByUserUuid: userUuid,
            expiresAt,
            usedAt: dbRow.used_at,
        });
        expect(builder.where).toHaveBeenNthCalledWith(
            1,
            'code_hash',
            'hashed-code',
        );
        expect(builder.where).toHaveBeenNthCalledWith(
            2,
            'expires_at',
            '>',
            'database-now',
        );
        expect(builder.update).toHaveBeenCalledWith({
            used_at: 'database-now',
        });
    });

    it('finds an unused unexpired code without consuming it', async () => {
        const now = vi.fn(() => 'database-now');
        const builder = {
            where: vi.fn(),
            whereNull: vi.fn(),
            first: vi.fn(async () => ({ ...dbRow, used_at: null })),
        };
        builder.where.mockReturnValue(builder);
        builder.whereNull.mockReturnValue(builder);
        const database = Object.assign(
            vi.fn(() => builder),
            {
                fn: { now },
            },
        ) as unknown as Knex;
        const model = new OnboardingConnectCodeModel({ database });

        await expect(model.find('hashed-code')).resolves.toEqual({
            projectUuid,
            createdByUserUuid: userUuid,
            expiresAt,
            usedAt: null,
        });
        expect(builder.where).toHaveBeenNthCalledWith(
            1,
            'code_hash',
            'hashed-code',
        );
        expect(builder.where).toHaveBeenNthCalledWith(
            2,
            'expires_at',
            '>',
            'database-now',
        );
        expect(builder.whereNull).toHaveBeenCalledWith('used_at');
    });

    it.each(['replayed', 'expired'])('returns null for a %s code', async () => {
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
        const model = new OnboardingConnectCodeModel({ database });

        await expect(model.consume('hashed-code')).resolves.toBeNull();
    });
});

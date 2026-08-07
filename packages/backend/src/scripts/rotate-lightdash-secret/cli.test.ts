import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type LightdashSecrets } from '../../config/parseConfig';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { runRotationCli } from './cli';

const secrets = (active: string, ...fallbacks: string[]): LightdashSecrets => ({
    active,
    fallbacks,
    all: [active, ...fallbacks],
});

const encryptionFor = (keyring: LightdashSecrets) =>
    new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: keyring.active,
            lightdashSecrets: keyring,
        },
    });

const rotatedSecrets = secrets('new secret', 'old secret');

const database = knex({ client: MockClient, dialect: 'pg' });
const context = {
    database: database as unknown as Knex,
    encryptionUtil: encryptionFor(rotatedSecrets),
    lightdashSecrets: rotatedSecrets,
};

const TABLE_PRESENT = [{ table_name: 'present' }];

let tracker: Tracker;

beforeAll(() => {
    tracker = getTracker();
});

afterEach(() => {
    tracker.reset();
});

describe('runRotationCli', () => {
    test('returns a non-zero exit code when a value is unreadable', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.any(/graphile_worker\.jobs/).response({ rows: [] });
        tracker.on.select('user_oauth_grants').response([
            {
                user_oauth_grant_uuid: 'grant-bad',
                encrypted_refresh_token: encryptionFor(
                    secrets('unknown secret'),
                ).encrypt('lost'),
            },
        ]);
        tracker.on.select('personal_access_tokens').response([]);
        tracker.on.select('service_accounts').response([]);

        const lines: string[] = [];
        const exitCode = await runRotationCli(
            ['--table', 'user_oauth_grants'],
            context,
            (line) => lines.push(line),
        );

        expect(exitCode).toEqual(1);
        const output = lines.join('\n');
        expect(output).toContain(
            'unreadable user_oauth_grants.encrypted_refresh_token at user_oauth_grant_uuid=grant-bad',
        );
        expect(output).toContain(
            '1 ciphertext value(s) are unreadable with every configured secret',
        );
    });

    test('returns a zero exit code when everything has converged', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.any(/graphile_worker\.jobs/).response({ rows: [] });
        tracker.on.select('user_oauth_grants').response([
            {
                user_oauth_grant_uuid: 'grant-1',
                encrypted_refresh_token: context.encryptionUtil.encrypt('ok'),
            },
        ]);
        tracker.on.select('personal_access_tokens').response([]);
        tracker.on.select('service_accounts').response([]);

        const lines: string[] = [];
        const exitCode = await runRotationCli(
            ['--table', 'user_oauth_grants'],
            context,
            (line) => lines.push(line),
        );

        expect(exitCode).toEqual(0);
        expect(lines.join('\n')).toContain(
            'No blockers found by this command.',
        );
    });

    test('rejects an unknown argument', async () => {
        await expect(
            runRotationCli(['--frobnicate'], context, () => {}),
        ).rejects.toThrow('Unknown argument: --frobnicate');
    });

    test('rejects an invalid batch size', async () => {
        await expect(
            runRotationCli(['--batch-size', '0'], context, () => {}),
        ).rejects.toThrow('--batch-size must be a positive integer');
    });
});

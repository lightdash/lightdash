import { AiPrincipalFailureReason } from '@lightdash/common';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { PostgresAiCredentialProvider } from '../PostgresAiCredentialProvider';
import {
    connection,
    policy,
    principal,
} from '../PostgresAiCredentialProvider.mock';

describe.skipIf(!process.env.PGHOST)(
    'Postgres AI principal integration',
    () => {
        const admin = new Client();
        const ref = `ai_probe_${randomBytes(8).toString('hex')}`;
        let connected = false;
        let created = false;

        beforeAll(async () => {
            await admin.connect();
            connected = true;
        });

        afterAll(async () => {
            if (!connected) return;
            try {
                if (created) {
                    await admin.query(`DROP OWNED BY "${ref}"`);
                    await admin.query(`DROP ROLE "${ref}"`);
                }
            } finally {
                await admin.end();
            }
        });

        test('probes the generated login and rejects NOLOGIN', async () => {
            const provider = new PostgresAiCredentialProvider();
            const secret = await provider.createSecret();
            const { rows } = await admin.query<{ database: string }>(
                'SELECT current_database() AS database',
            );
            const args = {
                connection: {
                    ...connection,
                    host: process.env.PGHOST!,
                    port: Number(process.env.PGPORT ?? 5432),
                    sslmode: process.env.PGSSLMODE ?? 'disable',
                    dbname: rows[0].database,
                },
                principal: { ...principal, ...secret, ref },
                policy,
                person: { userUuid: 'test-user', email: 'test@example.test' },
            };
            const statements = provider
                .setupScript(args)
                .parts[0].body.split('\n')
                .filter((line) => !line.trimStart().startsWith('--'))
                .join('\n');
            await admin.query(statements);
            created = true;
            const minted = await provider.mint(args);
            const probe = await provider.probe(
                minted.credentials,
                minted.assurances,
            );
            expect(probe).toMatchObject({
                ok: true,
                observed: { session_user: ref, current_user: ref },
            });
            await admin.query(`ALTER ROLE "${ref}" NOLOGIN`);
            expect(
                await provider.probe(minted.credentials, minted.assurances),
            ).toMatchObject({
                ok: false,
                reason: AiPrincipalFailureReason.DISABLED_OR_LOCKED,
            });
        });
    },
);

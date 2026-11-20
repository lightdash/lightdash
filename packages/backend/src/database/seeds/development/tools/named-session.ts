import {
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_EDITOR_PASSWORD,
    SEED_ORG_1_VIEWER,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_1_VIEWER_PASSWORD,
} from '@lightdash/common';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
    RAINBOW_DEVELOPER,
    RAINBOW_JOIN_MEMBER,
    RAINBOW_SECOND_ORG_ADMIN,
} from '../../rainbowFixtureMatrix';

const { password } = SEED_ORG_1_EDITOR_PASSWORD;
const identities = new Map<string, [string, string, string?]>([
    [
        'admin',
        [
            SEED_ORG_1_ADMIN_EMAIL.email,
            SEED_ORG_1_ADMIN_PASSWORD.password,
            SEED_ORG_1_ADMIN.user_uuid,
        ],
    ],
    [
        'editor',
        [SEED_ORG_1_EDITOR_EMAIL.email, password, SEED_ORG_1_EDITOR.user_uuid],
    ],
    [
        'viewer',
        [
            SEED_ORG_1_VIEWER_EMAIL.email,
            SEED_ORG_1_VIEWER_PASSWORD.password,
            SEED_ORG_1_VIEWER.user_uuid,
        ],
    ],
    [
        'developer',
        [RAINBOW_DEVELOPER.email, password, RAINBOW_DEVELOPER.user.user_uuid],
    ],
    [
        'second-admin',
        [
            RAINBOW_SECOND_ORG_ADMIN.email,
            password,
            RAINBOW_SECOND_ORG_ADMIN.user.user_uuid,
        ],
    ],
    ['join-member', [RAINBOW_JOIN_MEMBER.email, password]],
]);

function main(origin: string, name: string) {
    if (
        !/^https:\/\/lightdash--pr-[1-9][0-9]*\.lightdash\.rainbowmachine\.dev$/.test(
            origin,
        ) ||
        new URL(origin).origin !== origin
    )
        throw new Error('Expected an exact Lightdash PR preview origin');
    const identity = identities.get(name);
    if (!identity) throw new Error('Unknown fixture identity');
    const [email, secret, uuid] = identity;
    process.umask(0o077);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lightdash-${name}-`));
    const jarPath = path.join(dir, 'cookies.txt');
    const statePath = path.join(dir, 'storage.json');
    const request = (route: string, args: string[], input?: string): unknown =>
        JSON.parse(
            execFileSync(
                'curl',
                [
                    '-q',
                    '--silent',
                    '--fail',
                    '--max-time',
                    '30',
                    ...args,
                    `${origin}/api/v1/${route}`,
                ],
                { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
            ),
        );
    try {
        const ok = z.object({ status: z.literal('ok') });
        ok.parse(
            request(
                'login',
                [
                    '-c',
                    jarPath,
                    '-H',
                    'Content-Type: application/json',
                    '--data-binary',
                    '@-',
                ],
                JSON.stringify({ email, password: secret }),
            ),
        );
        const host = new URL(origin).hostname;
        const cookies = fs
            .readFileSync(jarPath, 'utf8')
            .split('\n')
            .filter(
                (line) =>
                    line &&
                    (!line.startsWith('#') || line.startsWith('#HttpOnly_')),
            )
            .map((line) => {
                const [domain, scope, cookiePath, secure, expiry, key, value] =
                    line.replace(/^#HttpOnly_/, '').split('\t');
                if (domain !== host || scope !== 'FALSE' || !key || !value)
                    throw new Error('Invalid cookie scope');
                return {
                    domain,
                    path: cookiePath,
                    name: key,
                    value,
                    secure: secure === 'TRUE',
                    httpOnly: line.startsWith('#HttpOnly_'),
                    expires: Number(expiry) || -1,
                    sameSite: 'Lax',
                };
            });
        const { results } = ok
            .extend({
                results: z.object({
                    email: z.string(),
                    userUuid: z.string().uuid(),
                }),
            })
            .parse(request('user', ['-b', jarPath]));
        if (
            !cookies.length ||
            results.email !== email ||
            (uuid && results.userUuid !== uuid)
        )
            throw new Error('Unexpected identity');
        fs.writeFileSync(statePath, JSON.stringify({ cookies, origins: [] }), {
            flag: 'wx',
        });
        process.stdout.write(
            `${JSON.stringify({ name, origin, jarPath, statePath, verifiedBy: '/api/v1/user' })}\n`,
        );
    } catch {
        fs.rmSync(dir, { recursive: true, force: true });
        throw new Error('Could not verify the named fixture session');
    }
}

try {
    main(process.argv[2], process.argv[3]);
} catch (error) {
    process.stderr.write(
        `${error instanceof Error ? error.message : 'Named session failed'}\n`,
    );
    process.exitCode = 1;
}

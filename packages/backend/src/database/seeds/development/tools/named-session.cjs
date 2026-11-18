const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function main(origin, name) {
    if (
        !/^https:\/\/lightdash--pr-[1-9][0-9]*\.lightdash\.rainbowmachine\.dev$/.test(
            origin,
        ) ||
        new URL(origin).origin !== origin
    ) {
        throw Error('Expected an exact Lightdash PR preview origin');
    }
    const seed = require('@lightdash/common');
    const roles = ['admin', 'editor', 'viewer'];
    const identities = new Map(
        roles.map((role) => {
            const key = `SEED_ORG_1_${role.toUpperCase()}`;
            return [
                role,
                [
                    seed[`${key}_EMAIL`].email,
                    seed[`${key}_PASSWORD`].password,
                    seed[key].user_uuid,
                ],
            ];
        }),
    );
    const { password } = seed.SEED_ORG_1_EDITOR_PASSWORD;
    identities.set('developer', [
        'rainbow-developer@example.test',
        password,
        'e8394ede-3daf-45bb-a7d6-59705612fa41',
    ]);
    identities.set('second-admin', [
        'rainbow-second-admin@example.test',
        password,
        'c4a2d8b3-6e5f-4a9b-8d7c-3f8e2b1a4c69',
    ]);
    identities.set('join-member', [
        'rainbow-member@join.rainbow.example.test',
        password,
    ]);
    if (!identities.has(name)) throw Error('Unknown fixture identity');
    const [email, secret, uuid] = identities.get(name);
    process.umask(0o077);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lightdash-${name}-`));
    const jarPath = path.join(dir, 'cookies.txt');
    const statePath = path.join(dir, 'storage.json');
    const request = (route, args, input) =>
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
                { input, stdio: ['pipe', 'pipe', 'ignore'] },
            ),
        );
    try {
        if (
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
            ).status !== 'ok'
        )
            throw Error();
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
                const [domain, , cookiePath, secure, expiry, key, value] = line
                    .replace(/^#HttpOnly_/, '')
                    .split('\t');
                if (domain !== host || !key || !value) throw Error();
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
        const { status, results } = request('user', ['-b', jarPath]);
        if (
            !cookies.length ||
            status !== 'ok' ||
            results?.email !== email ||
            !results.userUuid ||
            (uuid && results.userUuid !== uuid)
        )
            throw Error();
        fs.writeFileSync(statePath, JSON.stringify({ cookies, origins: [] }), {
            flag: 'wx',
        });
        console.log(
            JSON.stringify({
                name,
                origin,
                jarPath,
                statePath,
                verifiedBy: '/api/v1/user',
            }),
        );
    } catch {
        fs.rmSync(dir, { recursive: true, force: true });
        throw Error('Could not verify the named fixture session');
    }
}

try {
    main(...process.argv.slice(2));
} catch (error) {
    console.error(
        error.code ? 'Named-session dependency unavailable' : error.message,
    );
    process.exitCode = 1;
}

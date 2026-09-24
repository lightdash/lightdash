import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} = require('@lightdash/common');

const baseUrl = new URL(process.argv[2]);
const deadline = Date.now() + 180_000;

const requestSignal = () =>
    AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now())));

async function warmPreview() {
    try {
        const health = await fetch(new URL('/api/v1/health', baseUrl), {
            signal: requestSignal(),
        });
        if (!health.ok)
            throw new Error(`health returned HTTP ${health.status}`);

        const login = await fetch(new URL('/api/v1/login', baseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                password: SEED_ORG_1_ADMIN_PASSWORD.password,
            }),
            signal: requestSignal(),
        });
        if (!login.ok) throw new Error(`login returned HTTP ${login.status}`);

        const cookie = login.headers
            .getSetCookie()
            .map((header) => header.split(';')[0])
            .join('; ');
        if (!cookie) throw new Error('login returned no session cookie');

        const user = await fetch(new URL('/api/v1/user', baseUrl), {
            headers: { Cookie: cookie },
            signal: requestSignal(),
        });
        if (!user.ok) throw new Error(`user API returned HTTP ${user.status}`);

        process.stdout.write('Preview health, login, and user API are ready\n');
    } catch (error) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            throw new Error(
                `Preview did not warm within three minutes: ${String(error)}`,
            );
        }
        await new Promise((resolve) => {
            setTimeout(resolve, Math.min(3_000, remainingMs));
        });
        await warmPreview();
    }
}

await warmPreview();

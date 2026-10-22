import { config } from 'dotenv';
import path from 'path';

const originalEnv = { ...process.env };
export const rootDir = path.resolve(import.meta.dirname, '../..');
config({ path: path.join(rootDir, '.env.development') });
config({ path: path.join(rootDir, '.env.development.local'), override: true });
Object.assign(process.env, originalEnv);

export const LIGHTDASH_URL = process.env.SITE_URL || 'http://localhost:8080';

type ApiResponse<T> = { status: 'ok'; results: T } | { status: 'error' };

export async function loginToLightdash(): Promise<string> {
    const response = await fetch(`${LIGHTDASH_URL}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'demo@lightdash.com',
            password: 'demo_password!',
        }),
    });
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!response.ok || !cookie) {
        throw new Error(`Login failed with HTTP ${response.status}`);
    }
    return cookie;
}

export async function lightdashApi<T>(
    cookie: string,
    method: string,
    apiPath: string,
    body?: unknown,
): Promise<T> {
    const response = await fetch(`${LIGHTDASH_URL}${apiPath}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as ApiResponse<T>;
    if (json.status !== 'ok') {
        throw new Error(`${method} ${apiPath} failed: ${JSON.stringify(json)}`);
    }
    return json.results;
}

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    ensureConfigFilePermissions,
    resolveAuth,
    writeConfigToFile,
} from './config';

// Masking file-type bits is the standard way to assert POSIX permissions.
// eslint-disable-next-line no-bitwise
const permissionBits = (mode: number): number => mode & 0o777;

const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('resolveAuth', () => {
    const loggedInConfig = {
        context: {
            apiKey: 'ldpat_from_login',
            serverUrl: 'https://app.lightdash.cloud',
        },
    };

    it('prefers the login token over LIGHTDASH_API_KEY', () => {
        expect(
            resolveAuth(loggedInConfig, {
                LIGHTDASH_API_KEY: 'ldpat_stale_env',
            }),
        ).toEqual({
            apiKey: 'ldpat_from_login',
            serverUrl: 'https://app.lightdash.cloud',
        });
    });

    it('prefers the login token when LIGHTDASH_URL points at the same instance', () => {
        expect(
            resolveAuth(loggedInConfig, {
                LIGHTDASH_API_KEY: 'ldpat_stale_env',
                LIGHTDASH_URL: 'https://app.lightdash.cloud/',
            }).apiKey,
        ).toBe('ldpat_from_login');
    });

    it('uses LIGHTDASH_API_KEY when LIGHTDASH_URL points at another instance', () => {
        expect(
            resolveAuth(loggedInConfig, {
                LIGHTDASH_API_KEY: 'ldpat_other_instance',
                LIGHTDASH_URL: 'https://other.lightdash.cloud',
            }),
        ).toEqual({
            apiKey: 'ldpat_other_instance',
            serverUrl: 'https://other.lightdash.cloud',
        });
    });

    it('uses LIGHTDASH_API_KEY when there is no saved login token', () => {
        expect(
            resolveAuth(
                { context: { serverUrl: 'https://app.lightdash.cloud' } },
                { LIGHTDASH_API_KEY: 'ldpat_env' },
            ).apiKey,
        ).toBe('ldpat_env');
    });

    it('falls back to the login token when no env vars are set', () => {
        expect(resolveAuth(loggedInConfig, {})).toEqual({
            apiKey: 'ldpat_from_login',
            serverUrl: 'https://app.lightdash.cloud',
        });
    });
});

describePosix('CLI config permissions', () => {
    let tempDir: string;
    let configDir: string;
    let configPath: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ld-config-'));
        configDir = path.join(tempDir, 'lightdash');
        configPath = path.join(configDir, 'config.yaml');
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('creates the config directory and file with private permissions', async () => {
        await writeConfigToFile(configPath, {
            context: { apiKey: 'ldpat_secret' },
        });

        expect(permissionBits((await fs.stat(configDir)).mode)).toBe(0o700);
        expect(permissionBits((await fs.stat(configPath)).mode)).toBe(0o600);
    });

    it('tightens permissions on an existing config path', async () => {
        await fs.mkdir(configDir, { recursive: true, mode: 0o755 });
        await fs.writeFile(configPath, 'context: {}', { mode: 0o644 });
        await fs.chmod(configDir, 0o755);
        await fs.chmod(configPath, 0o644);

        await ensureConfigFilePermissions(configPath);

        expect(permissionBits((await fs.stat(configDir)).mode)).toBe(0o700);
        expect(permissionBits((await fs.stat(configPath)).mode)).toBe(0o600);
    });
});

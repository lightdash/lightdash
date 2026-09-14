import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import {
    ensureConfigFilePermissions,
    getConfig,
    writeConfigToFile,
} from './config';

// Masking file-type bits is the standard way to assert POSIX permissions.
// eslint-disable-next-line no-bitwise
const permissionBits = (mode: number): number => mode & 0o777;

const describePosix = process.platform === 'win32' ? describe.skip : describe;

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

describe('CLI project environment override', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it.each([
        ['other-project', undefined],
        ['stored-project', 'Stored project'],
        ['', 'Stored project'],
        [undefined, 'Stored project'],
    ])(
        'only retains the cached name for its own project (override: %s)',
        async (projectOverride, expectedName) => {
            vi.stubEnv('LIGHTDASH_PROJECT', projectOverride);
            vi.spyOn(fs, 'chmod').mockResolvedValue(undefined);
            vi.spyOn(fs, 'readFile').mockResolvedValue(
                yaml.dump({
                    user: { anonymousUuid: 'anonymous-user' },
                    context: {
                        project: 'stored-project',
                        projectName: 'Stored project',
                        previewProject: 'preview-project',
                        previewName: 'Preview project',
                    },
                }),
            );

            const config = await getConfig();

            expect(config.context).toMatchObject({
                project: projectOverride || 'stored-project',
                projectName: expectedName,
                previewProject: 'preview-project',
                previewName: 'Preview project',
            });
        },
    );
});

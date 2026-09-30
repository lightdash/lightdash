import { readEmbeddedBundle } from '@lightdash/warehouses';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    loadPlaygroundBundle,
    PLAYGROUND_BUNDLE_ADOPTION_DELAY_MS,
    reconcilePlaygroundBundles,
    shouldAdoptPlaygroundBundle,
    validatePlaygroundDatabaseBundle,
} from './playgroundBundle';

const shippedDirectory = path.resolve(__dirname, '../../../assets/playground');
const currentVersion = readEmbeddedBundle(
    shippedDirectory,
    'jaffle_shop',
)!.version;
const retainedVersion = readEmbeddedBundle(
    path.join(shippedDirectory, 'previous'),
    'jaffle_shop',
)!.version;
const now = new Date('2026-10-01T12:00:00Z');
const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60 * 1000);

describe('playground bundle', () => {
    let copyDirectory: string;

    const rewriteChecksum = async (fileName: string) => {
        const checksumsPath = path.join(copyDirectory, 'SHA256SUMS');
        const digest = createHash('sha256')
            .update(await fs.readFile(path.join(copyDirectory, fileName)))
            .digest('hex');
        const lines = (await fs.readFile(checksumsPath, 'utf8'))
            .split('\n')
            .map((line) =>
                line.endsWith(`  ${fileName}`)
                    ? `${digest}  ${fileName}`
                    : line,
            );
        await fs.writeFile(checksumsPath, lines.join('\n'));
    };

    beforeEach(async () => {
        copyDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-playground-bundle-'),
        );
        await fs.cp(shippedDirectory, copyDirectory, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(copyDirectory, { recursive: true, force: true });
    });

    describe('loadPlaygroundBundle', () => {
        it('loads the shipped bundle and checks every explore table exists', async () => {
            const bundle = await loadPlaygroundBundle(
                shippedDirectory,
                validatePlaygroundDatabaseBundle,
            );

            expect(bundle.version).toBe(currentVersion);
            expect(bundle.explores.length).toBeGreaterThan(0);
            expect(bundle.content.version).toBe(1);
        });

        it('refuses a payload that does not match SHA256SUMS', async () => {
            await fs.appendFile(path.join(copyDirectory, 'explores.json'), ' ');
            const validate = vi.fn(async () => undefined);

            await expect(
                loadPlaygroundBundle(copyDirectory, validate),
            ).rejects.toThrow('explores.json in');
            expect(validate).not.toHaveBeenCalled();
        });

        it('refuses a bundle without SHA256SUMS', async () => {
            await fs.rm(path.join(copyDirectory, 'SHA256SUMS'));

            await expect(
                loadPlaygroundBundle(copyDirectory, vi.fn()),
            ).rejects.toThrow(`No playground bundle found in ${copyDirectory}`);
        });

        it('refuses explores that do not match the schema', async () => {
            await fs.writeFile(
                path.join(copyDirectory, 'explores.json'),
                JSON.stringify([{ name: 'orders', tables: {} }]),
            );
            await rewriteChecksum('explores.json');

            await expect(
                loadPlaygroundBundle(copyDirectory, vi.fn()),
            ).rejects.toThrow('Playground explores bundle is invalid');
        });

        it('passes the expected tables and version to the database check', async () => {
            const validate = vi.fn(async () => undefined);

            await loadPlaygroundBundle(shippedDirectory, validate);

            expect(validate).toHaveBeenCalledExactlyOnceWith({
                bundleVersion: currentVersion,
                expectedTables: expect.arrayContaining([
                    '"jaffle_shop"."jaffle"."orders"',
                    '"jaffle_shop"."jaffle"."customers"',
                ]),
            });
        });
    });

    describe('validatePlaygroundDatabaseBundle', () => {
        it('names the tables the database is missing', async () => {
            await expect(
                validatePlaygroundDatabaseBundle({
                    bundleVersion: currentVersion,
                    expectedTables: [
                        '"jaffle_shop"."jaffle"."orders"',
                        '"jaffle_shop"."jaffle"."not_a_table"',
                    ],
                }),
            ).rejects.toThrow(
                'Playground database is missing tables the explores use: "jaffle_shop"."jaffle"."not_a_table"',
            );
        });
    });

    describe('shouldAdoptPlaygroundBundle', () => {
        const decide = (
            projectVersion: string | null,
            firstSeenMinutesAgo: number,
        ) =>
            shouldAdoptPlaygroundBundle({
                projectVersion,
                currentVersion: 'current',
                servableVersions: ['current', 'previous'],
                currentFirstSeenAt: minutesAgo(firstSeenMinutesAgo),
                now,
            });

        it('leaves a project that is already current', () => {
            expect(decide('current', 60)).toBe(false);
        });

        it('waits for the adoption delay while other servers may serve the old version', () => {
            const delayMinutes = PLAYGROUND_BUNDLE_ADOPTION_DELAY_MS / 60000;
            expect(decide('previous', delayMinutes - 1)).toBe(false);
            expect(decide('previous', delayMinutes)).toBe(true);
            expect(decide(null, delayMinutes - 1)).toBe(false);
            expect(decide(null, delayMinutes)).toBe(true);
        });

        it('moves a project at once when this server cannot serve its version', () => {
            expect(decide('unknown', 0)).toBe(true);
        });
    });

    describe('reconcilePlaygroundBundles', () => {
        const buildProjectModel = (firstSeenMinutesAgo: number) => ({
            recordPlaygroundBundleVersionSeen: vi.fn(async () =>
                minutesAgo(firstSeenMinutesAgo),
            ),
            getPlaygroundBundleProjectsNotOnVersion: vi.fn(async () => [
                {
                    projectUuid: 'retained-project',
                    playgroundBundleVersion: retainedVersion,
                },
                {
                    projectUuid: 'unknown-project',
                    playgroundBundleVersion: 'unknown',
                },
                {
                    projectUuid: 'legacy-project',
                    playgroundBundleVersion: null,
                },
            ]),
            saveExploresToCache: vi.fn(async () => ({
                cachedExploreUuids: [],
            })),
        });

        it('moves only unservable projects during the adoption delay', async () => {
            const projectModel = buildProjectModel(5);

            await expect(
                reconcilePlaygroundBundles({
                    projectModel,
                    dataDirectory: shippedDirectory,
                    validatePlaygroundDatabase: vi.fn(async () => undefined),
                    now,
                }),
            ).resolves.toEqual({
                version: currentVersion,
                adopted: 1,
                waiting: 2,
                failed: 0,
            });
            expect(
                projectModel.recordPlaygroundBundleVersionSeen,
            ).toHaveBeenCalledWith(currentVersion);
            expect(
                projectModel.saveExploresToCache,
            ).toHaveBeenCalledExactlyOnceWith(
                'unknown-project',
                expect.any(Array),
                true,
                undefined,
                currentVersion,
            );
        });

        it('moves every project after the adoption delay and keeps going past a failure', async () => {
            const projectModel = buildProjectModel(31);
            projectModel.saveExploresToCache.mockRejectedValueOnce(
                new Error('lock timeout'),
            );

            await expect(
                reconcilePlaygroundBundles({
                    projectModel,
                    dataDirectory: shippedDirectory,
                    validatePlaygroundDatabase: vi.fn(async () => undefined),
                    now,
                }),
            ).resolves.toEqual({
                version: currentVersion,
                adopted: 2,
                waiting: 0,
                failed: 1,
            });
            expect(projectModel.saveExploresToCache).toHaveBeenCalledTimes(3);
        });

        it('does not load the bundle when no project needs to move', async () => {
            const projectModel = buildProjectModel(5);
            projectModel.getPlaygroundBundleProjectsNotOnVersion.mockResolvedValue(
                [],
            );
            const validate = vi.fn(async () => undefined);

            await reconcilePlaygroundBundles({
                projectModel,
                dataDirectory: shippedDirectory,
                validatePlaygroundDatabase: validate,
                now,
            });

            expect(validate).not.toHaveBeenCalled();
        });
    });
});

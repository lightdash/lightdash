import { PromotionAction, type GroupAsCode } from '@lightdash/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';
import { lightdashApi } from '../dbt/apiClient';
import {
    countDependencySkippedGroups,
    downloadGroups,
    getGroupsFolder,
    readGroupFiles,
    uploadGroups,
} from './groups';

vi.mock('../dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

describe('groups as code', () => {
    let tmpDir: string;

    const group = (name: string, members: string[] = []): GroupAsCode => ({
        version: 1,
        name,
        members,
    });

    const writeGroup = async (
        filename: string,
        value: GroupAsCode | string,
    ) => {
        const folder = getGroupsFolder(tmpDir);
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(
            path.join(folder, filename),
            typeof value === 'string'
                ? value
                : yaml.dump(value, { sortKeys: true }),
        );
    };

    beforeEach(async () => {
        vi.mocked(lightdashApi).mockReset();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'groups-test-'));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('downloads deterministic groups, empty groups, and collision-safe filenames', async () => {
        const folder = getGroupsFolder(tmpDir);
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(path.join(folder, 'stale.yml'), 'stale: true');
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            groups: [
                group('Finance?', ['z@example.com', 'a@example.com']),
                group('Empty'),
                group('Finance!'),
            ],
        } as never);

        await expect(downloadGroups('organization-uuid', tmpDir)).resolves.toBe(
            3,
        );

        const financeBangHash = createHash('sha256')
            .update('Finance!')
            .digest('hex')
            .slice(0, 8);
        const financeQuestionHash = createHash('sha256')
            .update('Finance?')
            .digest('hex')
            .slice(0, 8);
        expect((await fs.readdir(folder)).sort()).toStrictEqual(
            [
                'empty.yml',
                `finance-${financeBangHash}.yml`,
                `finance-${financeQuestionHash}.yml`,
            ].sort(),
        );
        expect(
            yaml.load(
                await fs.readFile(
                    path.join(folder, `finance-${financeQuestionHash}.yml`),
                    'utf8',
                ),
            ),
        ).toStrictEqual({
            version: 1,
            name: 'Finance?',
            members: ['a@example.com', 'z@example.com'],
        });
        expect(
            yaml.load(
                await fs.readFile(path.join(folder, 'empty.yml'), 'utf8'),
            ),
        ).toStrictEqual({ version: 1, name: 'Empty', members: [] });
    });

    it('rejects duplicate exact names but preserves case-sensitive identity', async () => {
        await writeGroup('one.yml', group('Finance'));
        await writeGroup('two.yml', group('Finance'));

        await expect(readGroupFiles(tmpDir)).rejects.toThrow(
            'Duplicate group name "Finance"',
        );

        await fs.rm(getGroupsFolder(tmpDir), { recursive: true });
        await writeGroup('upper.yml', group('Finance'));
        await writeGroup('lower.yml', group('finance'));
        await expect(readGroupFiles(tmpDir)).resolves.toHaveLength(2);
    });

    it('is a backward-compatible no-op when the groups folder is missing', async () => {
        await expect(
            uploadGroups('organization-uuid', tmpDir),
        ).resolves.toMatchObject({
            created: 0,
            updated: 0,
            unchanged: 0,
            failed: 0,
            dependencySkipped: 0,
        });
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('continues after malformed and API-failing group files', async () => {
        await writeGroup('bad-yaml.yml', 'name: [unterminated');
        await writeGroup('api-error.yml', group('API error'));
        await writeGroup('valid.yml', group('Valid'));
        vi.mocked(lightdashApi)
            .mockRejectedValueOnce(new Error('unknown member'))
            .mockResolvedValueOnce({ action: PromotionAction.CREATE } as never);

        await expect(
            uploadGroups('organization-uuid', tmpDir),
        ).resolves.toMatchObject({
            created: 1,
            updated: 0,
            unchanged: 0,
            failed: 2,
        });
        expect(lightdashApi).toHaveBeenCalledTimes(2);
    });

    it('reports all promotion actions and sends the portable body', async () => {
        await writeGroup('create.yml', group('Create'));
        await writeGroup('same.yml', group('Same'));
        await writeGroup('update.yml', group('Update', ['member@example.com']));
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ action: PromotionAction.CREATE } as never)
            .mockResolvedValueOnce({
                action: PromotionAction.NO_CHANGES,
            } as never)
            .mockResolvedValueOnce({ action: PromotionAction.UPDATE } as never);

        await expect(
            uploadGroups('organization-uuid', tmpDir),
        ).resolves.toMatchObject({
            created: 1,
            updated: 1,
            unchanged: 1,
            failed: 0,
        });
        expect(lightdashApi).toHaveBeenNthCalledWith(3, {
            method: 'POST',
            url: '/api/v2/orgs/organization-uuid/groups/code',
            body: expect.any(String),
        });
        expect(
            JSON.parse(vi.mocked(lightdashApi).mock.calls[2][0].body as string),
        ).toStrictEqual(group('Update', ['member@example.com']));
    });

    it('counts files skipped because a dependency phase failed', async () => {
        await writeGroup('one.yml', group('One'));
        await writeGroup('two.yml', 'invalid: [yaml');
        await fs.writeFile(
            path.join(getGroupsFolder(tmpDir), 'ignored.yaml'),
            'name: ignored',
        );

        await expect(countDependencySkippedGroups(tmpDir)).resolves.toBe(2);
    });
});

import {
    OrganizationMemberRole,
    PromotionAction,
    UserAsCodeInvitationStatus,
    UserAsCodeLifecycleStatus,
    type UserAsCode,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';
import { lightdashApi } from '../dbt/apiClient';
import {
    downloadUsers,
    getUsersFolder,
    readUserFiles,
    uploadUsers,
} from './users';

vi.mock('../dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

describe('users as code', () => {
    let tmpDir: string;

    const user = (
        email: string,
        overrides: Partial<UserAsCode> = {},
    ): UserAsCode => ({
        version: 1,
        email,
        disabled: false,
        role: { type: 'system', name: OrganizationMemberRole.EDITOR },
        ...overrides,
    });

    const writeUser = async (filename: string, value: UserAsCode) => {
        const folder = getUsersFolder(tmpDir);
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(
            path.join(folder, filename),
            yaml.dump(value, { sortKeys: true }),
        );
    };

    beforeEach(async () => {
        vi.mocked(lightdashApi).mockReset();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'users-test-'));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('downloads deterministic portable users and preserves unknown YAML', async () => {
        const folder = getUsersFolder(tmpDir);
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(path.join(folder, 'stale.yml'), 'stale: true');
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            users: [
                user('z@example.com', {
                    disabled: true,
                    role: { type: 'custom', name: 'Data steward' },
                }),
                user('a@example.com'),
            ],
        } as never);

        await expect(downloadUsers('organization-uuid', tmpDir)).resolves.toBe(
            2,
        );

        expect((await fs.readdir(folder)).sort()).toStrictEqual([
            'a-example-com.yml',
            'stale.yml',
            'z-example-com.yml',
        ]);
        expect(
            yaml.load(
                await fs.readFile(
                    path.join(folder, 'z-example-com.yml'),
                    'utf8',
                ),
            ),
        ).toStrictEqual({
            disabled: true,
            email: 'z@example.com',
            role: { name: 'Data steward', type: 'custom' },
            version: 1,
        });
    });

    it('rejects case-insensitive duplicate emails before upload', async () => {
        await writeUser('one.yml', user('duplicate@example.com'));
        await writeUser('two.yml', user('DUPLICATE@example.com'));

        await expect(readUserFiles(tmpDir)).rejects.toThrow(
            'Duplicate user email "duplicate@example.com"',
        );
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('is a backward-compatible no-op when the users folder is missing', async () => {
        await expect(
            uploadUsers('organization-uuid', tmpDir),
        ).resolves.toMatchObject({
            created: 0,
            updated: 0,
            unchanged: 0,
            failed: 0,
        });
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('does not request invitations by default', async () => {
        await writeUser('user.yml', user('person@example.com'));
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ users: [] } as never)
            .mockResolvedValueOnce({
                action: PromotionAction.CREATE,
                lifecycle: UserAsCodeLifecycleStatus.AWAITING_AUTHENTICATION,
                invitation: UserAsCodeInvitationStatus.NOT_REQUESTED,
            } as never);

        const summary = await uploadUsers('organization-uuid', tmpDir);

        expect(summary).toMatchObject({
            created: 1,
            awaitingAuthentication: 1,
            invited: 0,
            failed: 0,
        });
        expect(lightdashApi).toHaveBeenNthCalledWith(2, {
            method: 'POST',
            url: '/api/v2/orgs/organization-uuid/code/users',
            body: expect.any(String),
        });
    });

    it('passes sendInvite and reports invitation outcomes', async () => {
        await writeUser('user.yml', user('person@example.com'));
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ users: [] } as never)
            .mockResolvedValueOnce({
                action: PromotionAction.CREATE,
                lifecycle: UserAsCodeLifecycleStatus.AWAITING_AUTHENTICATION,
                invitation: UserAsCodeInvitationStatus.SENT,
            } as never);

        const summary = await uploadUsers('organization-uuid', tmpDir, true);

        expect(summary.invited).toBe(1);
        expect(lightdashApi).toHaveBeenNthCalledWith(2, {
            method: 'POST',
            url: '/api/v2/orgs/organization-uuid/code/users?sendInvite=true',
            body: expect.any(String),
        });
    });

    it('promotes an enabled admin before demoting the current admin', async () => {
        const currentAdmin = user('current@example.com', {
            role: { type: 'system', name: OrganizationMemberRole.ADMIN },
        });
        const desiredAdmin = user('new@example.com', {
            role: { type: 'system', name: OrganizationMemberRole.ADMIN },
        });
        const desiredDemotion = user('current@example.com');
        await writeUser('a-demote.yml', desiredDemotion);
        await writeUser('z-promote.yml', desiredAdmin);
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ users: [currentAdmin] } as never)
            .mockResolvedValue({
                action: PromotionAction.UPDATE,
                lifecycle: UserAsCodeLifecycleStatus.READY,
                invitation: UserAsCodeInvitationStatus.NOT_REQUESTED,
            } as never);

        await uploadUsers('organization-uuid', tmpDir);

        const firstBody = JSON.parse(
            vi.mocked(lightdashApi).mock.calls[1][0].body as string,
        );
        const secondBody = JSON.parse(
            vi.mocked(lightdashApi).mock.calls[2][0].body as string,
        );
        expect(firstBody.email).toBe('new@example.com');
        expect(secondBody.email).toBe('current@example.com');
    });
});

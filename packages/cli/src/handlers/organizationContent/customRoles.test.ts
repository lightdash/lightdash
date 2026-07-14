import { PromotionAction, type CustomRoleAsCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';
import { lightdashApi } from '../dbt/apiClient';
import {
    downloadCustomRoles,
    getCustomRolesFolder,
    readCustomRoleFiles,
    uploadCustomRoles,
} from './customRoles';
import { getOrganizationContentFolder } from './index';

vi.mock('../dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

describe('custom roles as code', () => {
    let tmpDir: string;

    const writeCustomRole = async (
        filename: string,
        role: CustomRoleAsCode,
    ) => {
        const folder = getCustomRolesFolder(tmpDir);
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(
            path.join(folder, filename),
            yaml.dump(role, { sortKeys: true }),
        );
    };

    const customRole = (
        name: string,
        overrides: Partial<CustomRoleAsCode> = {},
    ): CustomRoleAsCode => ({
        version: 1,
        name,
        description: null,
        level: 'project',
        scopes: ['view:Dashboard'],
        ...overrides,
    });

    beforeEach(async () => {
        vi.mocked(lightdashApi).mockReset();
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'custom-roles-test-'));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('uses the standard organization content folder by default', () => {
        expect(getOrganizationContentFolder()).toBe(
            path.join(process.cwd(), 'lightdash'),
        );
        expect(getOrganizationContentFolder(tmpDir)).toBe(tmpDir);
        expect(getCustomRolesFolder(tmpDir)).toBe(
            path.join(tmpDir, 'custom-roles'),
        );
    });

    it('downloads portable custom role YAML from the code endpoint', async () => {
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            customRoles: [
                customRole('Custom Role Name', {
                    description: 'A useful role',
                    level: 'organization',
                    scopes: ['manage:Space', 'view:Dashboard'],
                }),
            ],
        } as never);

        const total = await downloadCustomRoles('organization-uuid', tmpDir);

        expect(total).toBe(1);
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: '/api/v2/orgs/organization-uuid/roles/code',
            body: undefined,
        });
        expect(
            yaml.load(
                await fs.readFile(
                    path.join(tmpDir, 'custom-roles', 'custom-role-name.yml'),
                    'utf8',
                ),
            ),
        ).toStrictEqual({
            version: 1,
            name: 'Custom Role Name',
            description: 'A useful role',
            level: 'organization',
            scopes: ['manage:Space', 'view:Dashboard'],
        });
    });

    it('uses stable hashes for normalized filename collisions', async () => {
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            customRoles: [customRole('Data Admin'), customRole('Data--Admin')],
        } as never);

        await downloadCustomRoles('organization-uuid', tmpDir);

        const filenames = (
            await fs.readdir(getCustomRolesFolder(tmpDir))
        ).sort();
        expect(filenames).toHaveLength(2);
        expect(
            filenames.every((filename) =>
                /^data-admin-[a-f0-9]{8}\.yml$/.test(filename),
            ),
        ).toBe(true);
    });

    it('counts backend create, update, and no-op actions', async () => {
        await writeCustomRole('a.yml', customRole('Role A'));
        await writeCustomRole('b.yml', customRole('Role B'));
        await writeCustomRole('c.yml', customRole('Role C'));
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ action: PromotionAction.CREATE } as never)
            .mockResolvedValueOnce({ action: PromotionAction.UPDATE } as never)
            .mockResolvedValueOnce({
                action: PromotionAction.NO_CHANGES,
            } as never);

        const summary = await uploadCustomRoles('organization-uuid', tmpDir);

        expect(summary).toStrictEqual({
            created: 1,
            updated: 1,
            unchanged: 1,
            failed: 0,
            failures: [],
        });
        expect(lightdashApi).toHaveBeenNthCalledWith(1, {
            method: 'POST',
            url: '/api/v2/orgs/organization-uuid/roles/code',
            body: expect.any(String),
        });
        expect(
            JSON.parse(vi.mocked(lightdashApi).mock.calls[0][0].body as string),
        ).toStrictEqual(customRole('Role A'));
    });

    it('rejects duplicate names before calling the API', async () => {
        await writeCustomRole('one.yml', customRole('Duplicate role'));
        await writeCustomRole('two.yml', customRole('Duplicate role'));

        await expect(readCustomRoleFiles(tmpDir)).rejects.toThrow(
            'Duplicate custom role name "Duplicate role"',
        );
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('continues after the backend rejects one role', async () => {
        await writeCustomRole(
            'a-invalid.yml',
            customRole('Invalid role', { scopes: ['delete:VirtualViewsss'] }),
        );
        await writeCustomRole('b-valid.yml', customRole('Valid role'));
        vi.mocked(lightdashApi)
            .mockRejectedValueOnce(
                new Error('Unknown custom role scopes: delete:VirtualViewsss'),
            )
            .mockResolvedValueOnce({ action: PromotionAction.UPDATE } as never);

        const summary = await uploadCustomRoles('organization-uuid', tmpDir);

        expect(summary).toMatchObject({
            created: 0,
            updated: 1,
            unchanged: 0,
            failed: 1,
        });
        expect(summary.failures[0].message).toContain(
            'Unknown custom role scopes: delete:VirtualViewsss',
        );
        expect(lightdashApi).toHaveBeenCalledTimes(2);
    });
});

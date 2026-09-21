import { PromotionAction, type UserAttributeAsCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { lightdashApi } from '../dbt/apiClient';
import { downloadUserAttributes, uploadUserAttributes } from './userAttributes';

vi.mock('../dbt/apiClient', () => ({ lightdashApi: vi.fn() }));

describe('user attributes as code files', () => {
    let directory: string;
    const document: UserAttributeAsCode = {
        version: 1,
        name: 'team_id',
        description: null,
        attributeDefaults: null,
        users: [{ email: 'user@example.com', values: ['a', 'b'] }],
        groups: [{ name: 'Team A', values: ['a'] }],
    };
    beforeEach(async () => {
        vi.resetAllMocks();
        directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'user-attributes-code-'),
        );
    });
    afterEach(async () => fs.rm(directory, { recursive: true, force: true }));
    it('round trips a document through the dedicated folder and API', async () => {
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            userAttributes: [document],
        });
        expect(await downloadUserAttributes('org', directory)).toBe(1);
        const file = path.join(directory, 'user_attributes/team_id.yml');
        expect(yaml.load(await fs.readFile(file, 'utf8'))).toEqual(document);
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            action: PromotionAction.NO_CHANGES,
        });
        expect(await uploadUserAttributes('org', directory)).toMatchObject({
            unchanged: 1,
            failed: 0,
        });
        expect(lightdashApi).toHaveBeenLastCalledWith({
            method: 'POST',
            url: '/api/v2/orgs/org/code/userAttributes',
            body: JSON.stringify(document),
        });
    });
    it('does nothing when older content has no attribute folder', async () => {
        expect(await uploadUserAttributes('org', directory)).toMatchObject({
            created: 0,
            updated: 0,
            failed: 0,
        });
        expect(lightdashApi).not.toHaveBeenCalled();
    });
    it('does not upload conflicting files for the same attribute', async () => {
        const folder = path.join(directory, 'user_attributes');
        await fs.mkdir(folder);
        await fs.writeFile(path.join(folder, 'first.yml'), yaml.dump(document));
        await fs.writeFile(
            path.join(folder, 'second.yaml'),
            yaml.dump({ ...document, groups: [] }),
        );
        expect(await uploadUserAttributes('org', directory)).toMatchObject({
            failed: 2,
        });
        expect(lightdashApi).not.toHaveBeenCalled();
    });
    it('keeps names containing path separators within the attribute folder', async () => {
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            userAttributes: [{ ...document, name: '../team' }],
        });
        await downloadUserAttributes('org', directory);
        expect(await fs.readdir(directory)).toEqual(['user_attributes']);
        const files = await fs.readdir(path.join(directory, 'user_attributes'));
        expect(files).toHaveLength(1);
        expect(files[0]).not.toContain('/');
    });
});

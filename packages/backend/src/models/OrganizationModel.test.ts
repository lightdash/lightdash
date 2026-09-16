import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { OrganizationColorPaletteTableName } from '../database/entities/organizationColorPalettes';
import { OrganizationTableName } from '../database/entities/organizations';
import { AiOrganizationSettingsTableName } from '../ee/database/entities/ai';
import { OrganizationModel } from './OrganizationModel';

const org = {
    organization_uuid: '00000000-0000-4000-8000-000000000001',
    organization_name: 'New organization',
    created_at: new Date(),
};

describe('OrganizationModel', () => {
    let database: Knex;
    let tracker: Tracker;

    beforeEach(() => {
        database = knex({ client: MockClient }); // pg dialect mock recurses on nested transactions
        tracker = getTracker();
    });

    afterEach(async () => {
        tracker.reset();
        await database.destroy();
    });

    it('creates organizations without AI tables on non-enterprise installations', async () => {
        const model = new OrganizationModel(database, {
            ...lightdashConfigMock,
            license: { ...lightdashConfigMock.license, licenseKey: null },
        });
        tracker.on.insert(OrganizationTableName).response([org]);
        tracker.on.insert(OrganizationColorPaletteTableName).response([]);

        await expect(
            model.create({ name: org.organization_name }),
        ).resolves.toMatchObject({
            organizationUuid: org.organization_uuid,
        });
        expect(
            tracker.history.insert.some((q) =>
                q.sql.includes(AiOrganizationSettingsTableName),
            ),
        ).toBe(false);
    });
});

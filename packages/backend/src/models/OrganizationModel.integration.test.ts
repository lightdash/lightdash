import { type Knex } from 'knex';
import { parseConfig } from '../config/parseConfig';
import { AiOrganizationSettingsTableName } from '../ee/database/entities/ai';
import { getTestContext } from '../vitest.setup.integration';
import { OrganizationModel } from './OrganizationModel';

describe('OrganizationModel', () => {
    let transaction: Knex.Transaction;

    beforeEach(async () => {
        transaction = await getTestContext().db.transaction();
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    it('enables AI agent turn reviews for new organizations', async () => {
        const model = new OrganizationModel(transaction, parseConfig());

        const org = await model.create({ name: 'New organization' });

        await expect(
            transaction(AiOrganizationSettingsTableName)
                .where('organization_uuid', org.organizationUuid)
                .first(),
        ).resolves.toMatchObject({ ai_agent_reviews_enabled: true });
    });
});

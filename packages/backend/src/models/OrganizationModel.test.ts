import { ParameterError } from '@lightdash/common';
import { type Knex } from 'knex';
import { OrganizationModel } from './OrganizationModel';

describe('OrganizationModel', () => {
    it('rejects creating an organization without a name', async () => {
        const database = vi.fn();
        const model = new OrganizationModel(database as unknown as Knex);

        await expect(model.create({ name: '   ' })).rejects.toBeInstanceOf(
            ParameterError,
        );
        expect(database).not.toHaveBeenCalled();
    });

    it('rejects removing an organization name', async () => {
        const database = vi.fn();
        const model = new OrganizationModel(database as unknown as Knex);

        await expect(
            model.update('organization-uuid', { name: '   ' }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(database).not.toHaveBeenCalled();
    });
});

import { toolEditDbtProjectArgsSchema } from './toolEditDbtProjectArgs';

describe('toolEditDbtProjectArgsSchema', () => {
    it('preserves an explicit dbt source identity', () => {
        const dbtSourceUuid = '00000000-0000-0000-0000-000000000002';

        expect(
            toolEditDbtProjectArgsSchema.parse({
                prompt: 'Update models/orders.yml',
                prUrl: null,
                startNewPullRequest: null,
                dbtSourceUuid,
            }),
        ).toMatchObject({ dbtSourceUuid });
    });
});

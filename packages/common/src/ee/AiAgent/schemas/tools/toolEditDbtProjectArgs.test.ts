import { toolEditDbtProjectArgsSchema } from './toolEditDbtProjectArgs';

describe('toolEditDbtProjectArgsSchema', () => {
    it('does not expose a dbt source identity', () => {
        expect('dbtSourceUuid' in toolEditDbtProjectArgsSchema.shape).toBe(
            false,
        );
    });
});

import fs from 'node:fs';
import {
    buildChartAsCodeSchema,
    getOutputPath,
    getSwaggerPath,
} from './generateChartAsCodeSchema';

const SWAGGER_PATH = getSwaggerPath();
const SCHEMA_PATH = getOutputPath();

describe('chart-as-code JSON schema', () => {
    it('is up to date with swagger.json (run `pnpm generate:chart-as-code-schema` to fix)', () => {
        const swagger = JSON.parse(
            fs.readFileSync(SWAGGER_PATH, 'utf8'),
        ) as Parameters<typeof buildChartAsCodeSchema>[0];

        const generated = buildChartAsCodeSchema(swagger);
        const committed = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
        expect(generated).toEqual(committed);
    });
});

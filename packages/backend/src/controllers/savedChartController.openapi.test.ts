import { describe, expect, it } from 'vitest';
import swagger from '../generated/swagger.json';

describe('saved chart OpenAPI contract', () => {
    it('validates project chart type versions as positive integers', () => {
        const { dataAppVizVersion } = (
            swagger.components.schemas.DataAppVizChart as {
                properties: Record<string, unknown>;
            }
        ).properties;

        expect(dataAppVizVersion).toMatchObject({
            type: 'integer',
            format: 'int32',
            minimum: 1,
        });
    });
});

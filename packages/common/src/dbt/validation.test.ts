import { DbtManifestVersion } from '../types/dbt';
import { ManifestValidator } from './validation';
import {
    modelWithWrongDimensionFormat,
    modelWithWrongMetricFormat,
} from './validation.mock';

describe.each([DbtManifestVersion.V8, DbtManifestVersion.V9])(
    'Dbt validation with manifest %s',
    (version) => {
        const validator = new ManifestValidator(version);
        test('should return error for format value', () => {
            expect(
                validator.isModelValid(modelWithWrongDimensionFormat),
            ).toEqual([
                false,
                'Field at "/columns/test/meta/dimension/format" must be equal to one of the allowed values',
            ]);
            expect(validator.isModelValid(modelWithWrongMetricFormat)).toEqual([
                false,
                'Field at "/columns/test/meta/metrics/test2/format" must be equal to one of the allowed values',
            ]);
        });
    },
);

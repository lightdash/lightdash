import { ApiConnectorType } from '@lightdash/common';
import { getLiveBaseLayer } from './build';

describe('built-in live source fields', () => {
    test.each(Object.values(ApiConnectorType))(
        'every built-in %s field tells people and agents what it means',
        (connector) => {
            const { definitions } = getLiveBaseLayer(connector);
            const undescribed = definitions
                .flatMap((definition) => [
                    ...definition.dimensions,
                    ...definition.metrics,
                ])
                .filter((field) => !field.description?.trim())
                .map((field) => field.name);
            expect(undescribed).toEqual([]);
        },
    );
});

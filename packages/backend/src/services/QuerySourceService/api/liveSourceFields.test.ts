import { ApiConnectorType } from '@lightdash/common';
import { getApiSourceBaseLayer } from './apiSourceExplores';

describe('built-in live source fields', () => {
    test.each(Object.values(ApiConnectorType))(
        'every built-in %s field tells people and agents what it means',
        (connector) => {
            const { definition } = getApiSourceBaseLayer(connector);
            const undescribed = [
                ...definition.dimensions,
                ...definition.metrics,
            ]
                .filter((field) => !field.description?.trim())
                .map((field) => field.name);
            expect(undescribed).toEqual([]);
        },
    );
});

import type { AiModelOption } from '@lightdash/common';
import { filterDeprecatedModelsForPicker, matchesModelConfig } from './utils';

const model = (name: string, deprecated = false): AiModelOption => ({
    name,
    modelId: `${name}-model-id`,
    displayName: name,
    description: '',
    provider: 'openai',
    default: false,
    supportsReasoning: true,
    deprecated,
});

const current = model('current');
const deprecated = model('deprecated', true);

describe('filterDeprecatedModelsForPicker', () => {
    it('hides deprecated models from new selections', () => {
        expect(
            filterDeprecatedModelsForPicker([current, deprecated], null),
        ).toEqual([current]);
    });

    it('keeps the selected deprecated model visible', () => {
        expect(
            filterDeprecatedModelsForPicker(
                [current, deprecated],
                'openai:deprecated',
            ),
        ).toEqual([current, deprecated]);
    });
});

describe('matchesModelConfig', () => {
    it('matches stored provider model IDs to their preset option', () => {
        expect(
            matchesModelConfig(deprecated, {
                modelName: 'deprecated-model-id',
                modelProvider: 'openai',
            }),
        ).toBe(true);
    });
});

import type { AiModelOption } from '@lightdash/common';
import {
    filterDeprecatedModelsForPicker,
    getModelGroupLabel,
    getSupersedingModel,
    matchesModelConfig,
    resolveModelForNewChat,
} from './utils';

const model = (
    name: string,
    deprecated = false,
    supersededBy: string | null = null,
): AiModelOption => ({
    name,
    modelId: `${name}-model-id`,
    displayName: name,
    description: '',
    provider: 'openai',
    default: false,
    supportsReasoning: true,
    deprecated,
    supersededBy,
});

const current = model('current');
const deprecated = model('deprecated', true, 'current');

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

describe('getModelGroupLabel', () => {
    it('uses a model-specific group label when provided', () => {
        expect(
            getModelGroupLabel({ ...current, groupLabel: 'Moonshot AI' }),
        ).toBe('Moonshot AI');
    });

    it('falls back to a human-readable provider label', () => {
        expect(getModelGroupLabel(current)).toBe('OpenAI');
        expect(getModelGroupLabel({ ...current, provider: 'google' })).toBe(
            'Google Gemini',
        );
    });
});

describe('getSupersedingModel', () => {
    it('returns the replacement of a retired model when it is offered', () => {
        expect(getSupersedingModel([current, deprecated], deprecated)).toBe(
            current,
        );
    });

    it('returns nothing for a current model or when the replacement is not offered', () => {
        expect(getSupersedingModel([current, deprecated], current)).toBeNull();
        expect(getSupersedingModel([deprecated], deprecated)).toBeNull();
        expect(
            getSupersedingModel(
                [{ ...current, provider: 'anthropic' }, deprecated],
                deprecated,
            ),
        ).toBeNull();
    });
});

describe('resolveModelForNewChat', () => {
    it('starts a new chat on the replacement of a retired model', () => {
        expect(resolveModelForNewChat([current, deprecated], deprecated)).toBe(
            current,
        );
    });

    it('keeps a retired model without an offered replacement', () => {
        expect(resolveModelForNewChat([deprecated], deprecated)).toBe(
            deprecated,
        );
    });
});

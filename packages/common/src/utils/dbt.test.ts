import { validateDbtSelector } from './dbt';

describe('validateDbtSelector', () => {
    it('should allow valid selectors', () => {
        const validSelectors = [
            'model_name',
            'tag:daily',
            'my_model+', // select my_model and all descendants
            '+my_model', // select my_model and all ancestors
            'folder.model',
            'model_123',
            'model-name',
            'model:staging',
            'model_name_with_underscore',
            '*_wildcard_*',
            'middle_wild*card',
            '@my_model', // select my_model, its descendants, and the ancestors of its descendants
            'events +customers tag:lightdash', // Complex selector with multiple parts
            'model/name', // forward slash
        ];

        validSelectors.forEach((selector) => {
            expect(validateDbtSelector(selector)).toBe(true);
        });
    });

    it('should reject invalid selectors', () => {
        const invalidSelectors = [
            'model\\name', // backslash
            'model$name', // special character
            'model@name', // @ in the middle
            'model@', // @ in the end
            'model;name', // semicolon
            'model`name', // backtick
            'model"name', // quotes
        ];

        invalidSelectors.forEach((selector) => {
            expect(validateDbtSelector(selector)).toBe(false);
        });
    });
});

import { createToolSchema } from './toolSchemaBuilder';

const schema = createToolSchema().withPagination().build();

describe('pagination field', () => {
    it('documents numeric pagination on the field itself', () => {
        expect(schema.shape.page.description).toBe(
            'Paginate results starting at 1. Pass a positive number (e.g. 1), never NaN or the string "null".',
        );
    });

    it.each([
        { input: 1, output: 1 },
        { input: '2', output: 2 },
        { input: 1.5, output: 1.5 },
        { input: null, output: null },
    ])(
        'preserves pagination coercion and nullability: $input',
        ({ input, output }) => {
            expect(schema.parse({ page: input })).toEqual({ page: output });
        },
    );

    it.each([NaN, 'NaN', 'null', 0, -1])(
        'preserves rejection of invalid page %s',
        (page) => {
            expect(schema.safeParse({ page }).success).toBe(false);
        },
    );
});

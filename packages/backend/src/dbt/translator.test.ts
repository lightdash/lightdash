import { attachTypesToModels } from './translator';
import {
    model,
    expectedModelWithType,
    warehouseSchema,
    warehouseSchemaWithMissingColumn,
    warehouseSchemaWithMissingTable,
} from './translator.mock';

describe('attachTypesToModels', () => {
    it('should return models with types', async () => {
        expect(attachTypesToModels([model], warehouseSchema, false)[0]).toEqual(
            expectedModelWithType,
        );
    });
    it('should return models with undefined type when is missing dataset or table or column', async () => {
        expect(attachTypesToModels([model], {}, false)[0]).toEqual(model);
        expect(
            attachTypesToModels(
                [model],
                warehouseSchemaWithMissingTable,
                false,
            )[0],
        ).toEqual(model);
        expect(
            attachTypesToModels(
                [model],
                warehouseSchemaWithMissingColumn,
                false,
            )[0],
        ).toEqual(model);
    });
    it('should throw when is missing dataset or table or column', async () => {
        expect(() => attachTypesToModels([model], {}, true)).toThrowError(
            'Model "myTable" was expected in your target warehouse at "myDatabase.mySchema.myTable". Does the table exist in your target data warehouse?',
        );
        expect(() =>
            attachTypesToModels([model], warehouseSchemaWithMissingTable, true),
        ).toThrowError(
            'Model "myTable" was expected in your target warehouse at "myDatabase.mySchema.myTable". Does the table exist in your target data warehouse?',
        );
        expect(() =>
            attachTypesToModels(
                [model],
                warehouseSchemaWithMissingColumn,
                true,
            ),
        ).toThrowError(
            'Column "myColumnName" from model "myTable" does not exist.\n "myColumnName.myTable" was not found in your target warehouse at myDatabase.mySchema.myTable. Try rerunning dbt to update your warehouse.',
        );
    });
});

import { warehouseClientMock } from '../../compiler/exploreCompiler.mock';
import { ParseError } from '../../types/errors';
import DbtSchemaEditor from './DbtSchemaEditor';
import {
    CUSTOM_METRIC,
    CUSTOM_RANGE_BIN_DIMENSION,
    CUSTOM_SQL_DIMENSION,
    EXPECTED_SCHEMA_JSON_WITH_NEW_MODEL,
    EXPECTED_SCHEMA_YML_WITH_NEW_METRICS_AND_DIMENSIONS,
    EXPECTED_SCHEMA_YML_WITH_NEW_MODEL,
    FIXED_WIDTH_BIN_DIMENSION,
    INVALID_SCHEMA_YML,
    NEW_MODEL,
    SCHEMA_JSON,
    SCHEMA_YML,
} from './DbtSchemaEditor.mock';

describe('DbtSchemaEditor', () => {
    it('should load the yaml schema and convert to JS and YML', () => {
        const editor = new DbtSchemaEditor(SCHEMA_YML);
        // can convert to JS
        expect(editor.toJS()).toEqual(SCHEMA_JSON);
        // can convert back to string
        expect(editor.toString()).toEqual(SCHEMA_YML);
    });

    it('should throw error with invalid yaml schema', () => {
        expect(() => new DbtSchemaEditor(INVALID_SCHEMA_YML)).toThrowError(
            ParseError,
        );
    });

    it('should update a model with custom metrics and custom dimensions', () => {
        const editor = new DbtSchemaEditor(SCHEMA_YML);
        // confirms it has models
        expect(editor.hasModels()).toEqual(true);
        // adds custom metrics
        editor.addCustomMetrics([CUSTOM_METRIC]);
        editor.addCustomDimensions(
            [
                CUSTOM_SQL_DIMENSION,
                FIXED_WIDTH_BIN_DIMENSION,
                CUSTOM_RANGE_BIN_DIMENSION,
            ],
            warehouseClientMock,
        );
        expect(editor.toString()).toEqual(
            EXPECTED_SCHEMA_YML_WITH_NEW_METRICS_AND_DIMENSIONS,
        );
    });

    it('should create a new file', () => {
        const editor = new DbtSchemaEditor('');
        // confirm it has no models
        expect(editor.hasModels()).toEqual(false);

        // add a new model
        editor.addModel(NEW_MODEL);
        expect(editor.hasModels()).toEqual(true);
        expect(editor.toJS()).toEqual(EXPECTED_SCHEMA_JSON_WITH_NEW_MODEL);
        expect(editor.toString()).toEqual(EXPECTED_SCHEMA_YML_WITH_NEW_MODEL);
    });
});

import { warehouseClientMock } from '../../compiler/exploreCompiler.mock';
import { ParseError } from '../../types/errors';
import {
    CustomDimensionType,
    DimensionType,
    MetricType,
} from '../../types/field';
import { SupportedDbtVersions } from '../../types/projects';
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
    SIMPLE_SCHEMA,
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

describe('dbt v1.10+ compatibility', () => {
    it('should add custom metrics under config.meta for dbt v1.10', () => {
        const editor = new DbtSchemaEditor(
            SIMPLE_SCHEMA,
            '',
            SupportedDbtVersions.V1_10,
        );
        editor.addCustomMetrics([
            {
                name: 'test_metric',
                description: 'Test metric',
                sql: 'COUNT(*)',
                type: MetricType.COUNT,
                table: 'test_table',
                baseDimensionName: 'test_column',
            },
        ]);

        const result = editor.toString().replace(/\s+/g, '');
        // Check that the structure is config->meta->metrics (no spaces)
        expect(result).toContain('config:meta:metrics:');
        // Ensure meta is not directly at column level
        expect(result).not.toContain('description:Atestcolumnmeta:');
    });

    it('should add custom metrics directly under meta for dbt v1.9', () => {
        const editor = new DbtSchemaEditor(
            SIMPLE_SCHEMA,
            '',
            SupportedDbtVersions.V1_9,
        );
        editor.addCustomMetrics([
            {
                name: 'test_metric',
                description: 'Test metric',
                sql: 'COUNT(*)',
                type: MetricType.COUNT,
                table: 'test_table',
                baseDimensionName: 'test_column',
            },
        ]);

        const result = editor.toString().replace(/\s+/g, '');
        // Check that meta is NOT inside config
        expect(result).not.toContain('config:meta:metrics:');
        // Check that meta is directly at column level
        expect(result).toContain('description:Atestcolumnmeta:metrics:');
    });

    it('should add custom dimensions under config.meta for dbt v1.10', () => {
        const editor = new DbtSchemaEditor(
            SIMPLE_SCHEMA,
            '',
            SupportedDbtVersions.V1_10,
        );
        editor.addCustomDimensions(
            [
                {
                    id: 'custom_dim',
                    name: 'Custom Dimension',
                    table: 'test_table',
                    type: CustomDimensionType.SQL,
                    sql: '${test_table.test_column} || "_suffix"',
                    dimensionType: DimensionType.STRING,
                },
            ],
            warehouseClientMock,
        );

        const result = editor.toString().replace(/\s+/g, '');
        // Check that the structure is config->meta->additional_dimensions (no spaces)
        expect(result).toContain('config:meta:additional_dimensions:');
        // Ensure meta is not directly at column level
        expect(result).not.toContain('description:Atestcolumnmeta:');
    });

    it('should add custom dimensions directly under meta for dbt v1.9', () => {
        const editor = new DbtSchemaEditor(
            SIMPLE_SCHEMA,
            '',
            SupportedDbtVersions.V1_9,
        );
        editor.addCustomDimensions(
            [
                {
                    id: 'custom_dim',
                    name: 'Custom Dimension',
                    table: 'test_table',
                    type: CustomDimensionType.SQL,
                    sql: '${test_table.test_column} || "_suffix"',
                    dimensionType: DimensionType.STRING,
                },
            ],
            warehouseClientMock,
        );

        const result = editor.toString().replace(/\s+/g, '');
        // Check that meta is NOT inside config
        expect(result).not.toContain('config:meta:additional_dimensions:');
        // Check that meta is directly at column level
        expect(result).toContain(
            'description:Atestcolumnmeta:additional_dimensions:',
        );
    });

    it('should handle dbt versions correctly in isDbtVersion110OrHigher', () => {
        // Test v1.9 and below
        const editorV19 = new DbtSchemaEditor(
            'version: 2',
            '',
            SupportedDbtVersions.V1_9,
        );
        expect(editorV19.isDbtVersion110OrHigher()).toBe(false);

        const editorV18 = new DbtSchemaEditor(
            'version: 2',
            '',
            SupportedDbtVersions.V1_8,
        );
        expect(editorV18.isDbtVersion110OrHigher()).toBe(false);

        // Test v1.10
        const editorV110 = new DbtSchemaEditor(
            'version: 2',
            '',
            SupportedDbtVersions.V1_10,
        );
        expect(editorV110.isDbtVersion110OrHigher()).toBe(true);

        // Test undefined version (defaults to false)
        const editorNoVersion = new DbtSchemaEditor('version: 2', '');
        expect(editorNoVersion.isDbtVersion110OrHigher()).toBe(false);
    });
});

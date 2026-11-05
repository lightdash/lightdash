import { warehouseClientMock } from '../compiler/exploreCompiler.mock';
import { convertExplores } from '../compiler/translator';
import { model } from '../compiler/translator.mock';
import {
    SupportedDbtAdapter,
    type DbtManifest,
    type DbtModelNode,
} from '../types/dbt';
import { DbtError, DbtModelTextError } from '../types/errors';
import { InlineErrorType } from '../types/explore';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import {
    assertValidDbtManifestIdentifiers,
    assertValidDbtModelIdentifiers,
    getDbtModelTextError,
} from './validateDbtText';

const input = (): DbtModelNode => ({
    ...structuredClone(model),
    package_name: 'primary',
    lightdash_source_name: 'primary',
    lightdash_source_uuid: 'primary-id',
});
const compile = (node: DbtModelNode, partial: boolean) =>
    convertExplores(
        [node],
        false,
        SupportedDbtAdapter.POSTGRES,
        warehouseClientMock,
        { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        { allowPartialCompilation: partial, includeModelIdentity: true },
    );

describe('dbt text persistence validation', () => {
    it.each(['normal', 'literal\\u0000', 'new\nline', 'Unicode 🦆 \ufffd'])(
        'preserves supported text %s',
        async (label) => {
            const node = input();
            node.meta = { label };
            expect(getDbtModelTextError(node)).toBeNull();
            const [explore] = await compile(node, true);
            expect(explore).not.toHaveProperty('errors');
            expect(explore.label).toBe(label);
        },
    );
    it.each(['meta', 'config', 'columns'] as const)(
        'rejects actual NUL in %s without echoing the value',
        async (field) => {
            const node = input();
            if (field === 'meta')
                node.meta = { label: 'sensitive-before\u0000sensitive-after' };
            if (field === 'config')
                node.config = {
                    ...node.config,
                    meta: { label: 'sensitive-before\u0000sensitive-after' },
                };
            if (field === 'columns')
                node.columns[Object.keys(node.columns)[0]].description =
                    'sensitive-before\u0000sensitive-after';
            const error = getDbtModelTextError(node);
            expect(error).toBeInstanceOf(DbtModelTextError);
            expect(error?.message).toContain(`model.${field}`);
            expect(error?.message).toContain(node.unique_id);
            expect(error?.message).not.toContain('sensitive-before');
            const [explore] = await compile(node, true);
            expect(explore).toMatchObject({
                dbtModelIdentity: {
                    sourceUuid: 'primary-id',
                    uniqueId: node.unique_id,
                },
                errors: [{ type: InlineErrorType.METADATA_PARSE_ERROR }],
            });
            expect(JSON.stringify(explore)).not.toContain('sensitive-before');
            await expect(compile(node, false)).rejects.toBeInstanceOf(
                DbtModelTextError,
            );
        },
    );
    it.each([
        'name',
        'unique_id',
        'package_name',
        'lightdash_source_name',
        'lightdash_source_uuid',
    ] as const)(
        'rejects invalid identity field %s as a source failure',
        (field) => {
            const node = input();
            node[field] = 'invalid\u0000identity';
            expect(() => assertValidDbtModelIdentifiers(node)).toThrow(
                DbtError,
            );
            try {
                assertValidDbtModelIdentifiers(node);
            } catch (error) {
                expect((error as Error).message).not.toContain(
                    'invalid\u0000identity',
                );
            }
        },
    );
    it.each(['name', 'unique_id', 'package_name'] as const)(
        'uses source failure for NUL metadata with missing identity field %s',
        async (field) => {
            const node = input();
            Object.assign(node, { [field]: undefined });
            node.meta = { label: 'private\u0000value' };
            expect(() => assertValidDbtModelIdentifiers(node)).toThrow(
                `model identity is invalid at model.${field}`,
            );
            await expect(compile(node, true)).rejects.toBeInstanceOf(DbtError);
        },
    );
    it('rejects source-wide metadata and invalid node keys without echoing values', () => {
        const node = {
            ...input(),
            config: { materialized: 'table', snowflake_warehouse: '' },
        };
        const manifest: DbtManifest = {
            nodes: { [node.unique_id]: node },
            metadata: {
                dbt_schema_version:
                    'https://schemas.getdbt.com/dbt/manifest/v11.json',
                generated_at: 'bad\u0000date',
                adapter_type: 'postgres',
            },
            metrics: {},
            docs: {},
        };
        expect(() =>
            assertValidDbtManifestIdentifiers(manifest, 'primary'),
        ).toThrow('manifest.metadata.generated_at');
        manifest.metadata.generated_at = '2026-11-04T00:00:00Z';
        manifest.nodes = { 'private\u0000key': node };
        expect(() =>
            assertValidDbtManifestIdentifiers(manifest, 'primary'),
        ).toThrow('manifest.nodes[invalid-key]');
    });
});

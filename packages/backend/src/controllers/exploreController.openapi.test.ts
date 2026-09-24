import { generateSpec } from '@tsoa/cli';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

type Schema = {
    $ref?: string;
    properties?: Record<string, Schema>;
    type?: string;
    nullable?: boolean;
};

const OPENAPI_TIMEOUT_MS = 120_000;

describe('explore OpenAPI contract', () => {
    let outputDirectory: string;
    let schemas: Record<string, Schema>;

    beforeAll(async () => {
        outputDirectory = mkdtempSync(path.join(tmpdir(), 'explore-openapi-'));
        await generateSpec(
            {
                entryFile: path.resolve(__dirname, '../index.ts'),
                noImplicitAdditionalProperties: 'ignore',
                controllerPathGlobs: [
                    path.resolve(__dirname, 'exploreController.ts'),
                ],
                outputDirectory,
                specVersion: 3,
            },
            { compilerOptions: {} },
        );
        schemas = JSON.parse(
            readFileSync(path.join(outputDirectory, 'swagger.json'), 'utf8'),
        ).components.schemas;
    }, OPENAPI_TIMEOUT_MS);

    afterAll(() => {
        rmSync(outputDirectory, { recursive: true, force: true });
    });

    test('the explore response keeps a typed schema with the connection binding', () => {
        const explore = schemas.ApiExploreResults;

        expect(explore.$ref).toBeUndefined();
        expect(Object.keys(explore.properties ?? {})).toEqual(
            expect.arrayContaining([
                'name',
                'baseTable',
                'tables',
                'warehouseConnectionUuid',
            ]),
        );
        expect(explore.properties?.warehouseConnectionUuid).toMatchObject({
            type: 'string',
            nullable: true,
        });
    });
});

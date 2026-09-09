import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { compileLightdashModels } from '../compiler/compileLightdashModels';
import { warehouseClientMock } from '../compiler/exploreCompiler.mock';
import { isExploreError } from '../types/explore';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { loadLightdashModels } from './loader';

const modelYaml = `type: model
name: orders
order_fields_by: label
sql_from: public.orders
dimensions:
  - name: id
    type: number
    sql: id
`;

describe('native model loading and compilation', () => {
    let projectDir: string;
    beforeEach(async () => {
        projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'native-models-'));
    });
    afterEach(async () => {
        await fs.rm(projectDir, { recursive: true, force: true });
    });
    const writeModel = async (sourcePath: string, contents = modelYaml) => {
        const filePath = path.join(projectDir, sourcePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, contents);
    };

    it.each(['models/nested/sales.yaml', 'lightdash/models/nested/sales.yml'])(
        'preserves the actual source path %s through explore compilation',
        async (sourcePath) => {
            await writeModel(sourcePath);
            const models = await loadLightdashModels(projectDir);
            const explores = await compileLightdashModels({
                models,
                warehouseSqlBuilder: warehouseClientMock,
                lightdashProjectConfig: { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
                loadSources: true,
            });
            expect(explores).toHaveLength(1);
            const explore = explores[0];
            if (!explore || isExploreError(explore))
                throw new Error('Expected compiled explore');
            expect(explore.tables.orders.ymlPath).toBe(sourcePath);
            expect(explore.tables.orders.orderFieldsBy).toBe('LABEL');
            expect(explore.tables.orders.dimensions.id).toBeDefined();
        },
    );

    it('prefers models/ over the legacy directory and ignores content YAML', async () => {
        await writeModel('models/orders.yml');
        await writeModel('models/space.yml', 'type: space\nname: My space\n');
        await writeModel('lightdash/models/ignored.yml');
        expect(
            (await loadLightdashModels(projectDir)).map(
                (model) => model.sourcePath,
            ),
        ).toEqual(['models/orders.yml']);
    });

    it.each(['type: model\nname: broken\n', 'type: model\ndimensions: ['])(
        'rejects invalid YAML instead of deploying only the remaining models',
        async (contents) => {
            await writeModel('models/orders.yml');
            await writeModel('models/broken.yml', contents);
            await expect(loadLightdashModels(projectDir)).rejects.toThrow(
                /broken.yml/,
            );
        },
    );

    it('rejects duplicate model names and identifies both source files', async () => {
        await writeModel('models/a.yml');
        await writeModel('models/nested/b.yml');
        await expect(loadLightdashModels(projectDir)).rejects.toThrow(
            'Duplicate Lightdash model "orders" in models/a.yml and models/nested/b.yml',
        );
    });
});

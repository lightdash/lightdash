import { type Knex } from 'knex';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { type queueEvidenceFixture } from './agentQueueEvidence.mock';

export const catalogEvidence = async (
    database: Knex,
    f: Awaited<ReturnType<typeof queueEvidenceFixture>>,
) => {
    const explore = structuredClone(validExplore);
    explore.tables.a.metrics.met2 = {
        ...explore.tables.a.metrics.met1,
        name: 'met2',
        label: 'Second metric',
    };
    await f.projects.saveExploresToCache(f.projectUuid, [explore], true);
    await f.catalogService.indexCatalog(f.projectUuid, f.userUuid);
    const items = await f.catalogModel.getCatalogItemsSummary(f.projectUuid);
    const source = items.find((item) => item.name === 'met1')!;
    const target = items.find((item) => item.name === 'met2')!;
    const [tag] = await database('tags')
        .insert({
            project_uuid: f.projectUuid,
            name: 'Retained tag',
            color: 'blue',
            created_by_user_uuid: f.userUuid,
            yaml_reference: null,
        })
        .returning('tag_uuid');
    await database('catalog_search_tags').insert({
        catalog_search_uuid: source.catalogSearchUuid,
        tag_uuid: tag.tag_uuid,
        created_by_user_uuid: f.userUuid,
        is_from_yaml: false,
    });
    await f.catalogModel.updateCatalogItemIcon([
        {
            catalogSearchUuid: source.catalogSearchUuid,
            icon: { unicode: '1f4ca' },
        },
    ]);
    await f.catalogModel.migrateMetricsTreeEdges([
        {
            source_metric_catalog_search_uuid: source.catalogSearchUuid,
            target_metric_catalog_search_uuid: target.catalogSearchUuid,
            created_by_user_uuid: f.userUuid,
            project_uuid: f.projectUuid,
            source: 'ui',
        },
    ]);
    const [tree] = await database('metrics_trees')
        .insert({
            project_uuid: f.projectUuid,
            slug: 'retained-tree',
            name: 'Retained tree',
            description: null,
            source: 'ui',
            created_by_user_uuid: f.userUuid,
        })
        .returning('metrics_tree_uuid');
    await database('metrics_tree_nodes').insert({
        metrics_tree_uuid: tree.metrics_tree_uuid,
        catalog_search_uuid: source.catalogSearchUuid,
        x_position: 12,
        y_position: 34,
        source: 'ui',
    });
    const payload = {
        projectUuid: f.projectUuid,
        userUuid: f.userUuid,
        organizationUuid: f.organizationUuid,
        prevCatalogItemsWithTags: await f.catalogModel.getCatalogItemsWithTags(
            f.projectUuid,
            { onlyTagged: true, includeYamlTags: false },
        ),
        prevCatalogItemsWithIcons:
            await f.catalogModel.getCatalogItemsWithIcons(f.projectUuid),
        prevMetricTreeEdges: await f.catalogModel.getAllMetricsTreeEdges(
            f.projectUuid,
        ),
        prevMetricsTreeNodes: await f.catalogModel.getAllMetricsTreeNodes(
            f.projectUuid,
        ),
    };
    expect(payload.prevCatalogItemsWithTags).toHaveLength(1);
    expect(payload.prevCatalogItemsWithIcons).toHaveLength(1);
    expect(payload.prevMetricTreeEdges).toHaveLength(1);
    expect(payload.prevMetricsTreeNodes).toHaveLength(1);
    await f.projects.saveExploresToCache(f.projectUuid, [explore], true);
    await f.schedulerClient.indexCatalog(payload);
    const state = async () => ({
        tags: (
            await f.catalogModel.getCatalogItemsWithTags(f.projectUuid, {
                onlyTagged: true,
                includeYamlTags: false,
            })
        ).map((item) => ({
            name: item.name,
            tags: item.catalogTags.map((value) => value.tagUuid),
        })),
        icons: (
            await f.catalogModel.getCatalogItemsWithIcons(f.projectUuid)
        ).map((item) => ({ name: item.name, icon: item.icon })),
        edges: (await f.catalogModel.getAllMetricsTreeEdges(f.projectUuid)).map(
            (edge) => ({ source: edge.source.name, target: edge.target.name }),
        ),
        nodes: (await f.catalogModel.getAllMetricsTreeNodes(f.projectUuid)).map(
            (node) => ({
                name: node.name,
                tree: node.metricsTreeUuid,
                x: node.xPosition,
                y: node.yPosition,
                source: node.source,
            }),
        ),
    });
    const restored = {
        tags: [{ name: 'met1', tags: [tag.tag_uuid] }],
        icons: [{ name: 'met1', icon: { unicode: '1f4ca' } }],
        edges: [{ source: 'met1', target: 'met2' }],
        nodes: [
            {
                name: 'met1',
                tree: tree.metrics_tree_uuid,
                x: 12,
                y: 34,
                source: 'ui',
            },
        ],
    };
    expect(await state()).toEqual({
        tags: [],
        icons: [],
        edges: [],
        nodes: [],
    });
    return { state, restored };
};

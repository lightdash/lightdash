import * as fs from 'fs';
import { resolveLineCount, resolveComplexity, resolveFilePath as resolveFilePathFn } from './complexity';
import type { ServiceDeps, GraphNode, GraphEdge, GraphData, SchedulerDeps, AdapterInfo } from './types';

export interface ExtraLayers {
    scheduler?: { deps: SchedulerDeps; eeDeps?: SchedulerDeps };
    entities?: { names: string[]; modelMap: Record<string, string[]> };
    adapters?: Record<string, AdapterInfo>;
    adapterImports?: Record<string, string[]>;
    middlewares?: Record<string, string[]>;
}

export function buildGraph(
    services: Record<string, ServiceDeps>,
    controllers: Record<string, string[]>,
    routers: Record<string, string[]>,
    eeData?: { services: Record<string, ServiceDeps>; controllers: Record<string, string[]>; modelNames: string[]; clientNames: string[] },
    extras?: ExtraLayers,
): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();
    const edgeSet = new Set<string>();

    const addEdge = (from: string, to: string, type: string) => {
        const key = `${from}\0${to}\0${type}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ from, to, type });
        }
    };

    const addNode = (id: string, type: GraphNode['type'], ee?: boolean) => {
        if (!nodeSet.has(id)) {
            const lineCount = resolveLineCount(id, type, ee);
            const complexity = resolveComplexity(id, type, ee);
            nodes.push({ id, type, ...(ee && { ee }), ...(lineCount && { lineCount }), ...(complexity && { complexity }) });
            nodeSet.add(id);
        }
    };

    for (const c of Object.keys(controllers).sort()) {
        addNode(c, 'controller');
    }

    for (const r of Object.keys(routers).sort()) {
        addNode(r, 'router');
    }

    for (const s of Object.keys(services).sort()) {
        addNode(s, 'service');
    }

    for (const deps of Object.values(services)) {
        for (const m of deps.models) addNode(m, 'model');
        for (const c of deps.clients) addNode(c, 'client');
    }

    for (const [ctrl, svcs] of Object.entries(controllers)) {
        for (const svc of svcs) {
            if (nodeSet.has(svc)) {
                addEdge(ctrl, svc, 'uses_service');
            }
        }
    }

    for (const [rtr, svcs] of Object.entries(routers)) {
        for (const svc of svcs) {
            if (nodeSet.has(svc)) {
                addEdge(rtr, svc, 'router_uses_service');
            }
        }
    }

    for (const [svc, deps] of Object.entries(services)) {
        for (const m of deps.models) {
            addEdge(svc, m, 'injects_model');
        }
        for (const c of deps.clients) {
            addEdge(svc, c, 'injects_client');
        }
        for (const s of deps.services) {
            if (nodeSet.has(s)) {
                addEdge(svc, s, 'injects_service');
            }
        }
    }

    if (eeData) {
        for (const c of Object.keys(eeData.controllers).sort()) {
            addNode(c, 'controller', true);
        }

        for (const s of Object.keys(eeData.services).sort()) {
            if (!nodeSet.has(s)) {
                addNode(s, 'service', true);
            }
        }

        for (const m of eeData.modelNames) {
            if (!nodeSet.has(m)) addNode(m, 'model', true);
        }
        for (const c of eeData.clientNames) {
            if (!nodeSet.has(c)) addNode(c, 'client', true);
        }

        for (const deps of Object.values(eeData.services)) {
            for (const m of deps.models) {
                if (!nodeSet.has(m)) addNode(m, 'model', true);
            }
            for (const c of deps.clients) {
                if (!nodeSet.has(c)) addNode(c, 'client', true);
            }
        }

        for (const [ctrl, svcs] of Object.entries(eeData.controllers)) {
            for (const svc of svcs) {
                if (nodeSet.has(svc)) {
                    addEdge(ctrl, svc, 'uses_service');
                }
            }
        }

        for (const [svc, deps] of Object.entries(eeData.services)) {
            for (const m of deps.models) {
                if (nodeSet.has(m)) {
                    addEdge(svc, m, 'injects_model');
                }
            }
            for (const c of deps.clients) {
                if (nodeSet.has(c)) {
                    addEdge(svc, c, 'injects_client');
                }
            }
            for (const s of deps.services) {
                if (nodeSet.has(s)) {
                    addEdge(svc, s, 'injects_service');
                }
            }
        }
    }

    if (extras?.scheduler) {
        const { deps, eeDeps } = extras.scheduler;

        addNode('SchedulerTask', 'scheduler');
        for (const svc of deps.services) {
            if (nodeSet.has(svc)) addEdge('SchedulerTask', svc, 'scheduler_uses_service');
        }
        for (const cli of deps.clients) {
            if (nodeSet.has(cli)) addEdge('SchedulerTask', cli, 'scheduler_uses_client');
        }

        if (eeDeps) {
            addNode('CommercialSchedulerWorker', 'scheduler', true);
            for (const svc of eeDeps.services) {
                if (nodeSet.has(svc)) addEdge('CommercialSchedulerWorker', svc, 'scheduler_uses_service');
            }
            for (const cli of eeDeps.clients) {
                if (nodeSet.has(cli)) addEdge('CommercialSchedulerWorker', cli, 'scheduler_uses_client');
            }
        }
    }

    if (extras?.entities) {
        const { names, modelMap } = extras.entities;
        const referencedEntities = new Set<string>();
        for (const entities of Object.values(modelMap)) {
            for (const e of entities) referencedEntities.add(e);
        }

        for (const name of names) {
            if (referencedEntities.has(name)) {
                addNode(name, 'entity');
            }
        }

        for (const [modelId, entities] of Object.entries(modelMap)) {
            for (const entity of entities) {
                if (nodeSet.has(entity)) {
                    addEdge(modelId, entity, 'uses_entity');
                }
            }
        }
    }

    if (extras?.adapters) {
        for (const [name, info] of Object.entries(extras.adapters)) {
            addNode(name, 'adapter');
            if (info.parent && extras.adapters[info.parent]) {
                addEdge(name, info.parent, 'extends_adapter');
            }
        }

        if (extras.adapterImports) {
            for (const [serviceId, adapterIds] of Object.entries(extras.adapterImports)) {
                for (const adapterId of adapterIds) {
                    if (nodeSet.has(adapterId)) {
                        addEdge(serviceId, adapterId, 'uses_adapter');
                    }
                }
            }
        }
    }

    if (extras?.middlewares) {
        for (const [name, serviceDeps] of Object.entries(extras.middlewares)) {
            addNode(name, 'middleware');
            for (const svc of serviceDeps) {
                if (nodeSet.has(svc)) {
                    addEdge(name, svc, 'middleware_uses_service');
                }
            }
        }
    }

    const analyticsUsers = nodes
        .filter((n) => n.type === 'service')
        .filter((n) => {
            const fp = resolveFilePathFn(n.id, 'service', n.ee);
            if (!fp) return false;
            try {
                const src = fs.readFileSync(fp, 'utf-8');
                return /LightdashAnalytics/.test(src);
            } catch {
                return false;
            }
        });

    if (analyticsUsers.length > 0) {
        addNode('LightdashAnalytics', 'analytics');
        for (const svc of analyticsUsers) {
            addEdge(svc.id, 'LightdashAnalytics', 'uses_analytics');
        }
    }

    const modelCount = nodes.filter((n) => n.type === 'model').length;
    const clientCount = nodes.filter((n) => n.type === 'client').length;

    return {
        nodes,
        edges,
        stats: {
            controllers: Object.keys(controllers).length,
            routers: Object.keys(routers).length,
            services: Object.keys(services).length,
            models: modelCount,
            clients: clientCount,
            schedulers: nodes.filter((n) => n.type === 'scheduler').length,
            entities: nodes.filter((n) => n.type === 'entity').length,
            adapters: nodes.filter((n) => n.type === 'adapter').length,
            middlewares: nodes.filter((n) => n.type === 'middleware').length,
            analytics: nodes.filter((n) => n.type === 'analytics').length,
            totalEdges: edges.length,
        },
    };
}

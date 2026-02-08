import { resolveLineCount, resolveComplexity } from './complexity';
import type { ServiceDeps, GraphNode, GraphEdge, GraphData } from './types';

export function buildGraph(
    services: Record<string, ServiceDeps>,
    controllers: Record<string, string[]>,
    routers: Record<string, string[]>,
    eeData?: { services: Record<string, ServiceDeps>; controllers: Record<string, string[]>; modelNames: string[]; clientNames: string[] },
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
            totalEdges: edges.length,
        },
    };
}

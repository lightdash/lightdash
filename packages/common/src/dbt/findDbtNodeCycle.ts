export type DbtCycleNode = {
    unique_id: string;
    depends_on: { nodes?: string[] } | null;
};

export const findDbtNodeCycle = (nodes: DbtCycleNode[]): string[] | null => {
    const graph = new Map(
        nodes.map((node) => [node.unique_id, node.depends_on?.nodes ?? []]),
    );
    const complete = new Set<string>();
    const active = new Map<string, number>();
    const path: string[] = [];
    for (const root of graph.keys()) {
        if (!complete.has(root)) {
            const stack = [{ id: root, next: 0 }];
            active.set(root, 0);
            path.push(root);
            while (stack.length > 0) {
                const frame = stack[stack.length - 1];
                const dependencies = graph.get(frame.id) ?? [];
                if (frame.next === dependencies.length) {
                    complete.add(frame.id);
                    active.delete(frame.id);
                    stack.pop();
                    path.pop();
                } else {
                    const dependency = dependencies[frame.next];
                    frame.next += 1;
                    const index = active.get(dependency);
                    if (index !== undefined)
                        return [...path.slice(index), dependency];
                    if (!complete.has(dependency) && graph.has(dependency)) {
                        active.set(dependency, path.length);
                        path.push(dependency);
                        stack.push({ id: dependency, next: 0 });
                    }
                }
            }
        }
    }
    return null;
};

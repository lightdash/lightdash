/**
 * Represents a node in a dependency graph
 */
export interface DependencyNode {
    name: string;
    dependencies: string[];
}

/**
 * Detects circular dependencies in a dependency graph using depth-first search.
 * Throws an error if a circular dependency is found.
 *
 * @param dependencies - Array of nodes with their dependencies
 * @param errorPrefix - Prefix for the error message (e.g., "table calculations", "metrics")
 * @throws Error if a circular dependency is detected, with the full cycle path
 *
 * @example
 * ```typescript
 * const dependencies = [
 *   { name: 'A', dependencies: ['B'] },
 *   { name: 'B', dependencies: ['C'] },
 *   { name: 'C', dependencies: ['A'] } // Creates a cycle: A -> B -> C -> A
 * ];
 * detectCircularDependencies(dependencies, 'table calculations');
 * // Throws: "Circular dependency detected in table calculations: A -> B -> C -> A"
 * ```
 */
export function detectCircularDependencies(
    dependencies: DependencyNode[],
    errorPrefix: string = 'items',
): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeName: string, path: string[]): void => {
        if (recursionStack.has(nodeName)) {
            const cycle = [...path, nodeName].join(' -> ');
            throw new Error(
                `Circular dependency detected in ${errorPrefix}: ${cycle}`,
            );
        }

        if (visited.has(nodeName)) {
            return;
        }

        visited.add(nodeName);
        recursionStack.add(nodeName);

        const node = dependencies.find((d) => d.name === nodeName);
        if (node) {
            for (const dep of node.dependencies) {
                // Only follow dependencies that are nodes in the graph
                if (dependencies.some((d) => d.name === dep)) {
                    dfs(dep, [...path, nodeName]);
                }
            }
        }

        recursionStack.delete(nodeName);
    };

    // Check all nodes for cycles
    for (const dep of dependencies) {
        if (!visited.has(dep.name)) {
            dfs(dep.name, []);
        }
    }
}

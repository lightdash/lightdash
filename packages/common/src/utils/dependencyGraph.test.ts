import {
    detectCircularDependencies,
    type DependencyNode,
} from './dependencyGraph';

describe('detectCircularDependencies', () => {
    it('should not throw for valid dependency graph with no cycles', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B', 'C'] },
            { name: 'B', dependencies: ['D'] },
            { name: 'C', dependencies: ['D'] },
            { name: 'D', dependencies: [] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'test items'),
        ).not.toThrow();
    });

    it('should not throw for empty dependency array', () => {
        expect(() =>
            detectCircularDependencies([], 'test items'),
        ).not.toThrow();
    });

    it('should not throw for single node with no dependencies', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: [] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'test items'),
        ).not.toThrow();
    });

    it('should not throw when dependencies reference non-existent nodes', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B', 'nonexistent'] },
            { name: 'B', dependencies: ['C'] },
            { name: 'C', dependencies: [] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'test items'),
        ).not.toThrow();
    });

    it('should not throw for multiple disconnected components', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B'] },
            { name: 'B', dependencies: [] },
            { name: 'C', dependencies: ['D'] },
            { name: 'D', dependencies: [] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'test items'),
        ).not.toThrow();
    });

    it('should detect simple circular dependency (A -> B -> A)', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B'] },
            { name: 'B', dependencies: ['A'] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'table calculations'),
        ).toThrow(
            'Circular dependency detected in table calculations: A -> B -> A',
        );
    });

    it('should detect self-referencing circular dependency (A -> A)', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['A'] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'metrics'),
        ).toThrow('Circular dependency detected in metrics: A -> A');
    });

    it('should detect longer circular dependency chain (A -> B -> C -> A)', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B'] },
            { name: 'B', dependencies: ['C'] },
            { name: 'C', dependencies: ['A'] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'calculations'),
        ).toThrow(
            'Circular dependency detected in calculations: A -> B -> C -> A',
        );
    });

    it('should detect circular dependency in complex graph (A -> B -> C -> D -> B)', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B'] },
            { name: 'B', dependencies: ['C'] },
            { name: 'C', dependencies: ['D'] },
            { name: 'D', dependencies: ['B'] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'fields'),
        ).toThrow(
            'Circular dependency detected in fields: A -> B -> C -> D -> B',
        );
    });

    it('should detect circular dependency with multiple paths', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B', 'C'] },
            { name: 'B', dependencies: ['D'] },
            { name: 'C', dependencies: ['D'] },
            { name: 'D', dependencies: ['A'] },
        ];

        expect(() => detectCircularDependencies(dependencies, 'nodes')).toThrow(
            'Circular dependency detected in nodes',
        );
    });

    it('should use default error prefix when not provided', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B'] },
            { name: 'B', dependencies: ['A'] },
        ];

        expect(() => detectCircularDependencies(dependencies)).toThrow(
            'Circular dependency detected in items: A -> B -> A',
        );
    });

    it('should handle graph with cycle not starting from first node', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B'] },
            { name: 'B', dependencies: [] },
            { name: 'C', dependencies: ['D'] },
            { name: 'D', dependencies: ['C'] },
        ];

        expect(() => detectCircularDependencies(dependencies, 'test')).toThrow(
            'Circular dependency detected in test: C -> D -> C',
        );
    });

    it('should handle complex valid graph with shared dependencies', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['D'] },
            { name: 'B', dependencies: ['D'] },
            { name: 'C', dependencies: ['D'] },
            { name: 'D', dependencies: ['E'] },
            { name: 'E', dependencies: [] },
        ];

        expect(() =>
            detectCircularDependencies(dependencies, 'test'),
        ).not.toThrow();
    });

    it('should handle node with multiple dependencies including a cycle', () => {
        const dependencies: DependencyNode[] = [
            { name: 'A', dependencies: ['B', 'C', 'D'] },
            { name: 'B', dependencies: [] },
            { name: 'C', dependencies: ['A'] },
            { name: 'D', dependencies: [] },
        ];

        expect(() => detectCircularDependencies(dependencies, 'test')).toThrow(
            'Circular dependency detected in test: A -> C -> A',
        );
    });
});

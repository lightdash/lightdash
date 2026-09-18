import type { Explore } from '@lightdash/common';

/**
 * Explore lookup shared by the query tools of one agent turn. Tools receive it
 * through their factory dependencies (the AI SDK no longer forwards a shared
 * execution context to tools).
 */
export class AgentContext {
    constructor(private readonly availableExplores: Explore[]) {}

    /**
     * Gets available explores from context
     */
    getAvailableExplores(): Explore[] {
        return this.availableExplores;
    }

    /**
     * Gets a specific explore by name from available explores
     *
     * @param exploreName - Name of the explore to get
     * @returns The explore
     * @throws {Error} If explore not found
     */
    getExplore(exploreName: string): Explore {
        const explore = this.availableExplores.find(
            (e) => e.name === exploreName,
        );

        if (!explore) {
            throw new Error(`Explore '${exploreName}' not found`);
        }

        return explore;
    }
}

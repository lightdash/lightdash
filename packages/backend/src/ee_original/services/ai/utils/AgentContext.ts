import type { Explore } from '@lightdash/common';

/**
 * Type-safe wrapper for experimental_context from AI SDK
 *
 * Provides validated access to context data passed to tool execution functions,
 * avoiding unsafe type casts.
 *
 * @example
 * ```typescript
 * // Create context instance
 * const context = new AgentContext({ availableExplores });
 *
 * // Pass it in experimental_context
 * experimental_context: context
 *
 * // Use in tool
 * execute: async (args, { experimental_context: context }) => {
 *   const ctx = AgentContext.from(context);
 *   const explore = ctx.getExplore('users');
 * }
 * ```
 */
export class AgentContext {
    constructor(private readonly availableExplores: Explore[]) {}

    /**
     * Creates a validated AgentContext from unknown context
     *
     * @param context - Raw context from experimental_context
     * @returns AgentContext instance with type-safe access methods
     * @throws {Error} If context validation fails
     */
    static from(context: unknown): AgentContext {
        if (!(context instanceof AgentContext)) {
            throw new Error(
                'Invalid agent context: expected AgentContext instance',
            );
        }

        return context;
    }

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

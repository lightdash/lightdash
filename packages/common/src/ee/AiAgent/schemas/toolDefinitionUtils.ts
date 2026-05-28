import { type ToolDescription, type ToolRuntime } from './defineTool';

export const resolveDescription = (
    description: ToolDescription,
    runtimeName: string,
): string =>
    typeof description === 'function' ? description(runtimeName) : description;

export const assertAvailable = (
    name: string,
    availability: readonly ToolRuntime[],
    runtime: ToolRuntime,
): void => {
    if (!availability.includes(runtime)) {
        throw new Error(
            `Tool "${name}" is not available in the ${runtime} runtime`,
        );
    }
};

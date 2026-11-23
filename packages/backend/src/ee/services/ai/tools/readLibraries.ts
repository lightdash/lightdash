import { asSchema, type Tool } from 'ai';
import type {
    CodeModeLibraries,
    CodeModeLibraryFunction,
} from '../../SemanticStudioService/codeMode/codeMode';
import type { AgentToolName } from '../loadout';

/** What read scripts can call, each one an existing tool under a shorter name. */
export const READ_LIBRARIES = {
    layer: {
        fields: 'grepFields',
        explore: 'getMetadata',
        search: 'searchSemanticLayer',
        impact: 'analyzeFieldImpact',
        changes: 'listChanges',
        values: 'searchFieldValues',
        context: 'loadProjectContext',
    },
    warehouse: {
        tables: 'listWarehouseTables',
        describe: 'describeWarehouseTable',
        columns: 'grepWarehouseColumns',
    },
} as const satisfies Record<string, Record<string, AgentToolName>>;

type ReadLibraryToolName = {
    [Lib in keyof typeof READ_LIBRARIES]: (typeof READ_LIBRARIES)[Lib][keyof (typeof READ_LIBRARIES)[Lib]];
}[keyof typeof READ_LIBRARIES];

const isToolResult = (
    output: unknown,
): output is { result: string; metadata: { status: string } } =>
    typeof output === 'object' &&
    output !== null &&
    'result' in output &&
    typeof output.result === 'string' &&
    'metadata' in output &&
    typeof output.metadata === 'object' &&
    output.metadata !== null &&
    'status' in output.metadata &&
    typeof output.metadata.status === 'string';

/** Calls a tool the way the model would, and returns the text the model would read. */
export const asLibraryFunction = (
    path: string,
    tool: Tool,
): CodeModeLibraryFunction => ({
    description: typeof tool.description === 'string' ? tool.description : '',
    schema: async () => asSchema(tool.inputSchema).jsonSchema,
    run: async (args) => {
        const { execute } = tool;
        if (!execute) throw new Error(`${path} cannot run here`);
        const schema = asSchema(tool.inputSchema);
        const parsed = schema.validate
            ? await schema.validate(args ?? {})
            : { success: true as const, value: args };
        if (!parsed.success) {
            throw new Error(`${path}: ${parsed.error.message}`);
        }
        const output: unknown = await execute(parsed.value, {
            toolCallId: `read:${path}`,
            messages: [],
            context: {},
        });
        if (!isToolResult(output)) return output;
        if (output.metadata.status === 'error') throw new Error(output.result);
        return output.result;
    },
});

/** The libraries whose tools this agent has; a library with none of them is left out. */
export const buildReadLibraries = (
    toolFor: (name: ReadLibraryToolName) => Tool | null,
): CodeModeLibraries => {
    const libraries: CodeModeLibraries = {};
    Object.entries(READ_LIBRARIES).forEach(([lib, fns]) => {
        Object.entries<ReadLibraryToolName>(fns).forEach(([fn, name]) => {
            const tool = toolFor(name);
            if (!tool) return;
            libraries[lib] = {
                ...libraries[lib],
                [fn]: asLibraryFunction(`${lib}.${fn}`, tool),
            };
        });
    });
    return libraries;
};

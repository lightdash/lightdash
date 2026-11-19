const MCP_APP_PARENT_PARAM = 'mcpAppParent';
export const MCP_APP_PARENT_STORAGE_KEY = 'lightdash-mcp-app-parent-origin';

export type McpAppFrameCommand =
    | { command: 'navigate'; args: { path: string } }
    | { command: 'getState'; args: Record<string, never> }
    | { command: 'addField'; args: { fieldId: string } }
    | { command: 'removeField'; args: { fieldId: string } }
    | {
          command: 'addFilter';
          args: { fieldId: string; operator?: string; values?: unknown[] };
      }
    | { command: 'setChartType'; args: { chartType: string } }
    | { command: 'runQuery'; args: Record<string, never> };

export type McpAppFrameRequest = McpAppFrameCommand & { id: string };

export type McpAppExplorerState = {
    tableName: string;
    dimensions: string[];
    metrics: string[];
    filterCount: number;
    chartType: string;
    rowCount: number | null;
    isRunning: boolean;
};

export type McpAppFrameMessage =
    | { type: 'lightdash:frame:page'; url: string; title: string }
    | {
          type: 'lightdash:frame:explore';
          explore: McpAppExplorerState | null;
      }
    | { type: 'lightdash:frame:openLink'; url: string }
    | {
          type: 'lightdash:frame:result';
          id: string;
          ok: boolean;
          result?: unknown;
          error?: string;
      };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseParentOrigin = (value: unknown): string | null => {
    if (typeof value !== 'string' || value === '') return null;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin === value ? url.origin : null;
};

export const resolveMcpAppParentOrigin = ({
    search,
    storage,
    isFramed,
}: {
    search: string;
    storage: Pick<Storage, 'getItem' | 'setItem'>;
    isFramed: boolean;
}): string | null => {
    if (!isFramed) return null;
    const fromQuery = parseParentOrigin(
        new URLSearchParams(search).get(MCP_APP_PARENT_PARAM),
    );
    if (fromQuery) {
        storage.setItem(MCP_APP_PARENT_STORAGE_KEY, fromQuery);
        return fromQuery;
    }
    return parseParentOrigin(storage.getItem(MCP_APP_PARENT_STORAGE_KEY));
};

const stringArg = (args: Record<string, unknown>, key: string) =>
    typeof args[key] === 'string' && args[key] !== ''
        ? (args[key] as string)
        : null;

export const parseFrameRequest = (data: unknown): McpAppFrameRequest | null => {
    if (!isRecord(data) || data.type !== 'lightdash:frame:command') return null;
    if (typeof data.id !== 'string' || data.id === '') return null;
    const args = isRecord(data.args) ? data.args : {};
    const { id } = data;
    switch (data.command) {
        case 'navigate': {
            const path = stringArg(args, 'path');
            return path ? { id, command: 'navigate', args: { path } } : null;
        }
        case 'addField':
        case 'removeField': {
            const fieldId = stringArg(args, 'fieldId');
            return fieldId
                ? { id, command: data.command, args: { fieldId } }
                : null;
        }
        case 'addFilter': {
            const fieldId = stringArg(args, 'fieldId');
            if (!fieldId) return null;
            const operator = stringArg(args, 'operator') ?? undefined;
            const values = Array.isArray(args.values) ? args.values : undefined;
            return {
                id,
                command: 'addFilter',
                args: { fieldId, operator, values },
            };
        }
        case 'setChartType': {
            const chartType = stringArg(args, 'chartType');
            return chartType
                ? { id, command: 'setChartType', args: { chartType } }
                : null;
        }
        case 'getState':
        case 'runQuery':
            return { id, command: data.command, args: {} };
        default:
            return null;
    }
};

export const resolveSameOriginPath = (
    path: string,
    origin: string,
): string | null => {
    let target: URL;
    try {
        target = new URL(path, origin);
    } catch {
        return null;
    }
    if (target.origin !== origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
};

export const isExternalHttpUrl = (url: string): boolean => {
    try {
        const { protocol } = new URL(url);
        return protocol === 'https:' || protocol === 'http:';
    } catch {
        return false;
    }
};

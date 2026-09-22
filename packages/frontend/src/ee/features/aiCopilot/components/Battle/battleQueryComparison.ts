type QueryToolCall = {
    toolName: string;
    toolArgs: object;
};

type QueryMessage = {
    role: string;
    toolCalls?: QueryToolCall[];
};

type QueryConfig = Record<string, unknown>;

export type BattleQuerySignature = {
    fingerprint: string;
    summary: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const stableValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => [key, stableValue(child)]),
    );
};

const sortedStrings = (value: unknown): unknown =>
    Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? [...value].sort()
        : value;

const normalizeQueryConfig = (queryConfig: QueryConfig): QueryConfig => ({
    ...queryConfig,
    dimensions: sortedStrings(queryConfig.dimensions),
    metrics: sortedStrings(queryConfig.metrics),
});

const collectFieldIds = (value: unknown, found = new Set<string>()) => {
    if (Array.isArray(value)) {
        value.forEach((item) => collectFieldIds(item, found));
    } else if (isRecord(value)) {
        if (typeof value.fieldId === 'string') found.add(value.fieldId);
        Object.values(value).forEach((item) => collectFieldIds(item, found));
    }
    return found;
};

const describeQuery = (queryConfig: QueryConfig): string => {
    const metrics = sortedStrings(queryConfig.metrics);
    const dimensions = sortedStrings(queryConfig.dimensions);
    const fields = [
        ...(Array.isArray(metrics) ? metrics : []),
        ...(Array.isArray(dimensions) ? dimensions : []),
    ];
    const filters = [...collectFieldIds(queryConfig.filters)].sort();
    return [
        fields.length > 0
            ? fields.join(', ')
            : String(queryConfig.exploreName ?? 'query'),
        filters.length > 0 ? `filters: ${filters.join(', ')}` : null,
    ]
        .filter(Boolean)
        .join(' · ');
};

export const getLatestBattleQuerySignature = (
    messages: QueryMessage[],
): BattleQuerySignature | null => {
    for (
        let messageIndex = messages.length - 1;
        messageIndex >= 0;
        messageIndex -= 1
    ) {
        const message = messages[messageIndex];
        if (message.role !== 'assistant' || !message.toolCalls) continue;
        for (
            let callIndex = message.toolCalls.length - 1;
            callIndex >= 0;
            callIndex -= 1
        ) {
            const call = message.toolCalls[callIndex];
            if (
                !['runQuery', 'generateVisualization'].includes(
                    call.toolName,
                ) ||
                !isRecord(call.toolArgs) ||
                !isRecord(call.toolArgs.queryConfig)
            )
                continue;
            const queryConfig = normalizeQueryConfig(call.toolArgs.queryConfig);
            return {
                fingerprint: JSON.stringify(stableValue(queryConfig)),
                summary: describeQuery(queryConfig),
            };
        }
    }
    return null;
};

export const compareBattleQueries = (
    leftMessages: QueryMessage[],
    rightMessages: QueryMessage[],
) => {
    const left = getLatestBattleQuerySignature(leftMessages);
    const right = getLatestBattleQuerySignature(rightMessages);
    if (!left || !right) return null;
    return { left, right, same: left.fingerprint === right.fingerprint };
};

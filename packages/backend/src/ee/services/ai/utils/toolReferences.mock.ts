export type ToolReference<Scope extends string, Source extends string> = {
    scope: Scope;
    source: Source;
    named: string;
};

export type KnownToolReference<Scope extends string, Source extends string> = {
    source: Source;
    named: string;
    scopes: readonly Scope[];
    reason: string;
};

/** Tool names from `candidates` that `text` mentions as whole words. */
export const namedTools = (
    text: string,
    candidates: readonly string[],
): Map<string, number> =>
    new Map(
        candidates
            .map((name): [string, number] => [
                name,
                text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0,
            ])
            .filter(([, count]) => count > 0),
    );

/** Groups references by source and named tool, so they compare against a known list. */
export const groupToolReferences = <
    Scope extends string,
    Source extends string,
>(
    references: ToolReference<Scope, Source>[],
) => {
    const groups = new Map<
        string,
        { source: Source; named: string; scopes: Set<Scope> }
    >();
    for (const { scope, source, named } of references) {
        const key = `${source} -> ${named}`;
        const group = groups.get(key) ?? { source, named, scopes: new Set() };
        group.scopes.add(scope);
        groups.set(key, group);
    }
    return [...groups.values()]
        .map(({ source, named, scopes }) => ({
            source,
            named,
            scopes: [...scopes].sort(),
        }))
        .sort((a, b) =>
            `${a.source} ${a.named}`.localeCompare(`${b.source} ${b.named}`),
        );
};

export const withoutReasons = <Scope extends string, Source extends string>(
    known: readonly KnownToolReference<Scope, Source>[],
) =>
    groupToolReferences(
        known.flatMap(({ source, named, scopes }) =>
            scopes.map((scope) => ({ scope, source, named })),
        ),
    );

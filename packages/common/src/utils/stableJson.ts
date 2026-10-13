/** JSON with object keys sorted, so equal values serialise identically. */
export const stableJson = (value: unknown): string =>
    JSON.stringify(value, (_key, child: unknown) =>
        child && typeof child === 'object' && !Array.isArray(child)
            ? Object.fromEntries(
                  Object.entries(child).sort(([a], [b]) => a.localeCompare(b)),
              )
            : child,
    );

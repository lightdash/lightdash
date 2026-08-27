import { InvalidArgumentError } from 'commander';

/**
 * Coercion for variadic reference options (--charts, --chart-types, --apps, ...).
 * Commander's required-value parsing consumes the next argv token even when it
 * is another option (e.g. `--chart-types --force` reads "--force" as a ref),
 * so reject option-like values with a clear missing-value error.
 */
export function parseRefsArgument(
    value: string,
    previous: string[] = [],
): string[] {
    if (value.startsWith('-')) {
        throw new InvalidArgumentError(
            'Expected a reference value but got another option. Pass one or more references after this flag, or use the matching --include-* flag to select all.',
        );
    }
    return [...previous, value];
}

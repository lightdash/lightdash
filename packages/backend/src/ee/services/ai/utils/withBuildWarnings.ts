/** Appends non-blocking data app build warnings to a tool's text result. */
export const withBuildWarnings = (text: string, warnings: string[]): string =>
    warnings.length === 0
        ? text
        : `${text}\nWarnings:\n${warnings.map((w) => `- ${w}`).join('\n')}`;

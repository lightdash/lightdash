import * as styles from './styles';

export const getDiagnosticsHint = (
    argv: string[] = process.argv.slice(2),
): string | null => {
    if (argv.includes('diagnostics')) {
        return null;
    }

    return `\n💡 Run ${styles.bold('lightdash diagnostics')} for more info.\n`;
};

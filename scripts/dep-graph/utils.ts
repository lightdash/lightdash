export function matchAll(str: string, re: RegExp): string[] {
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
        results.push(m[1]);
    }
    return results;
}

export function unique(arr: string[]): string[] {
    return [...new Set(arr)].sort();
}

export function escapeShellArg(arg: string): string {
    return "'" + arg.replace(/'/g, "'\\''") + "'";
}

import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bridge } from './processes';
import type { Instance } from './model';

export type ScreenshotOptions = {
    route: string;
    out: string | null;
    signedOut: boolean;
    fullPage: boolean;
    width: number;
    height: number;
};

export function screenshotOptions(args: string[]): ScreenshotOptions {
    const positional = args.slice(1).filter((value, index, values) => {
        if (index > 0 && ['--out', '--width', '--height'].includes(values[index - 1]))
            return false;
        return !value.startsWith('--');
    });
    if (positional.length > 1) throw new Error('screenshot accepts one route');
    const route = positional[0] ?? '/';
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('#'))
        throw new Error('Screenshot route must be a local path');
    const value = (name: string, fallback: string) => {
        const index = args.indexOf(name);
        if (index < 0) return fallback;
        const selected = args[index + 1];
        if (!selected || selected.startsWith('--'))
            throw new Error(`${name} needs a value`);
        return selected;
    };
    const width = Number(value('--width', '1440'));
    const height = Number(value('--height', '900'));
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 320 ||
        height < 240 ||
        width > 4096 ||
        height > 4096
    )
        throw new Error('Screenshot width and height must be valid pixels');
    return {
        route,
        out: args.includes('--out') ? path.resolve(value('--out', '')) : null,
        signedOut: args.includes('--signed-out'),
        fullPage: args.includes('--full-page'),
        width,
        height,
    };
}

export async function screenshot(
    instance: Instance,
    options: ScreenshotOptions,
): Promise<string> {
    if (!instance.ports || instance.phase !== 'ready')
        throw new Error('Instance is not ready');
    const out =
        options.out ??
        path.join(await mkdtemp(path.join(os.tmpdir(), 'ldenv-shot-')), 'page.png');
    await bridge(instance, 'screenshot', {
        LDENV_SCREENSHOT_FRONTEND_PORT: String(instance.ports.frontend),
        LDENV_SCREENSHOT_API_PORT: String(instance.ports.api),
        LDENV_SCREENSHOT_OPTIONS: JSON.stringify({ ...options, out }),
    });
    return out;
}

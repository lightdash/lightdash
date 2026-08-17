import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadAppEnv(): void {
	process.chdir(rootDir);
	process.loadEnvFile(join(rootDir, ".env"));
}

export function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is required`);
	}
	return value;
}

export function isMain(moduleUrl: string): boolean {
	const entry = process.argv[1];
	return entry !== undefined && pathToFileURL(resolve(entry)).href === moduleUrl;
}

export function runMain(main: () => Promise<void>): void {
	void main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}

export function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

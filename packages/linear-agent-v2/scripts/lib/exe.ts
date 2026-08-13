import exedev, { ExeAPIError, type ExedevClient } from "@exedev/sdk";
import { requireEnv } from "./app.ts";

export function createExeClient(): ExedevClient {
	return exedev({ token: requireEnv("EXE_API_KEY") });
}

export async function rawExeCommand(
	exe: ExedevClient,
	command: string,
): Promise<string> {
	const result = await exe.exec(command);
	if (!result.ok) {
		throw new ExeAPIError(command, result.status, result.body);
	}
	return result.body.trim();
}

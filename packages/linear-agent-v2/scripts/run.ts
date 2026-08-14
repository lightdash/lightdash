import { execa } from "execa";
import { isMain, loadAppEnv, runMain } from "./lib/app.ts";
import { publishPreview } from "./preview.ts";
import { publishPullRequest } from "./publish-pr.ts";

interface VmReady {
	name: string;
	host: string;
}

function findVms(stderr: string): VmReady[] {
	const hosts = new Map<string, string>();
	for (const match of stderr.matchAll(/VM ready: name=([^\s]+)(?: host=([^\s]+))?/g)) {
		const name = match[1];
		if (name) hosts.set(name, match[2] || `${name}.exe.xyz`);
	}
	return [...hosts.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, host]) => ({ name, host }));
}

async function main(): Promise<void> {
	loadAppEnv();
	const [message, ...extraArgs] = process.argv.slice(2);
	if (!message) {
		throw new Error("usage: run.ts <message> [extra flue run args, e.g. --id conv-1]");
	}

	console.error("=== flue run linear-coder ===");
	const startedAt = Date.now();
	const result = await execa(
		"pnpm",
		["exec", "flue", "run", "src/agents/linear-coder.ts", "-m", message, ...extraArgs],
		{ reject: false, stdout: "inherit", stderr: ["pipe", "inherit"] },
	);
	const exitCode = result.exitCode ?? 1;
	console.error(
		`=== flue run finished in ${Math.floor((Date.now() - startedAt) / 1_000)}s (exit ${exitCode}) ===`,
	);

	const vms = findVms(result.stderr);
	if (vms.length === 0) {
		console.error("WARN: no 'VM ready' line captured");
		process.exitCode = exitCode;
		return;
	}

	const shouldPreview = process.env.PREVIEW === "1";
	const shouldPublish = process.env.PUBLISH === "1";
	if ((shouldPreview || shouldPublish) && exitCode === 0) {
		for (const vm of vms) {
			const previewUrl = shouldPreview ? await publishPreview({ vm: vm.name, host: vm.host }) : undefined;
			if (previewUrl) console.log(`PREVIEW: ${previewUrl}`);
			if (shouldPublish) {
				const prUrl = await publishPullRequest({
					vm: vm.name,
					host: vm.host,
					previewUrl,
					issue: process.env.LINEAR_ISSUE,
				});
				console.log(`PR: ${prUrl}`);
			}
		}
	}

	// VMs stay bound to their conversation for reuse; the TTL sweeper reaps them.
	for (const vm of vms) {
		console.error(`NOTE: VM ${vm.name} kept for conversation reuse — 'pnpm sweep' reaps after TTL`);
	}
	process.exitCode = exitCode;
}

if (isMain(import.meta.url)) runMain(main);

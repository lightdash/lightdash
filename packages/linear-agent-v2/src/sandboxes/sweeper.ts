import { deleteExeVm } from './exedev.ts';
import { boundVms, listExeVms, TEMPLATE_VM, unbindVmByName, VM_TAG } from './vm-store.ts';

/**
 * TTL sweeper for leaked sandbox clones. Clones can't be named at `cp` time,
 * so they're tagged VM_TAG at creation and swept by tag + age. Age counts
 * from the later of created_at and the conversation's lastUsedAt, so an
 * actively-used VM isn't reaped mid-conversation.
 */

export const DEFAULT_TTL_HOURS = 8;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export interface SweepReport {
	swept: string[];
	kept: { name: string; reason: string }[];
}

export function ttlMsFromEnv(): number {
	const hours = Number(process.env.VM_TTL_HOURS);
	return (Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
}

export async function sweepLeakedVms(options: {
	ttlMs: number;
	dryRun?: boolean;
}): Promise<SweepReport> {
	const vms = await listExeVms();
	const bindings = boundVms();
	const lastUsedByName = new Map<string, number>();
	for (const binding of Object.values(bindings)) {
		lastUsedByName.set(
			binding.name,
			Math.max(lastUsedByName.get(binding.name) ?? 0, binding.lastUsedAt),
		);
	}

	const now = Date.now();
	const report: SweepReport = { swept: [], kept: [] };
	for (const vm of vms) {
		if (vm.vm_name === TEMPLATE_VM) {
			report.kept.push({ name: vm.vm_name, reason: 'template' });
			continue;
		}
		if (!Array.isArray(vm.tags) || !vm.tags.includes(VM_TAG)) {
			report.kept.push({ name: vm.vm_name, reason: `not tagged ${VM_TAG}` });
			continue;
		}
		const createdAt = Date.parse(vm.created_at);
		const lastActive = Math.max(
			Number.isFinite(createdAt) ? createdAt : 0,
			lastUsedByName.get(vm.vm_name) ?? 0,
		);
		const ageMs = now - lastActive;
		if (ageMs < options.ttlMs) {
			report.kept.push({
				name: vm.vm_name,
				reason: `fresh (${Math.round(ageMs / 60_000)}m old)`,
			});
			continue;
		}
		if (!options.dryRun) {
			try {
				await deleteExeVm({ apiToken: process.env.EXE_API_KEY as string, name: vm.vm_name });
				unbindVmByName(vm.vm_name);
			} catch (error) {
				report.kept.push({
					name: vm.vm_name,
					reason: `rm failed: ${error instanceof Error ? error.message : String(error)}`,
				});
				continue;
			}
		}
		report.swept.push(vm.vm_name);
	}
	return report;
}

/** Hourly in-process sweep; globalThis guard survives vite HMR re-eval. */
export function startSweeper(): void {
	const flag = globalThis as { __ldlinSweeper?: boolean };
	if (flag.__ldlinSweeper) return;
	flag.__ldlinSweeper = true;

	const run = async (): Promise<void> => {
		try {
			const report = await sweepLeakedVms({ ttlMs: ttlMsFromEnv() });
			if (report.swept.length > 0) {
				console.error(`[sweeper] reaped: ${report.swept.join(', ')}`);
			}
		} catch (error) {
			console.error('[sweeper] failed:', error instanceof Error ? error.message : error);
		}
	};
	void run();
	setInterval(run, SWEEP_INTERVAL_MS).unref?.();
}

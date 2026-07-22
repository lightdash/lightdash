import { randomBytes, randomUUID } from 'node:crypto';
import {
    CloudRunExecChannel,
    CloudRunGatewayClient,
} from './CloudRunExecChannel';
import { createGitOverCommands, shQuote } from './gitOverCommands';
import { type SnapshotStore } from './SnapshotStore';
import {
    type PersistOptions,
    type SandboxCapabilities,
    type SandboxGit,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
    type SnapshotRef,
} from './types';

/**
 * Strip the leading slash so a `tar -C / <path>` archives `home/user/repo`
 * rather than `/home/user/repo`, letting `tar -x -C /` restore it to the exact
 * same absolute location on resume (same convention as the Docker provider).
 */
const toArchiveRelative = (absolutePath: string): string =>
    absolutePath.replace(/^\/+/, '');

/** Static config the `gcp-cloud-run` provider needs. */
export interface CloudRunSandboxesConfig {
    /** Base URL of the sandbox gateway Cloud Run service. */
    sandboxUrl: string;
    /** Shared secret the gateway authenticates callers with. */
    sandboxSecret: string;
}

class CloudRunSandboxHandle implements SandboxHandle {
    readonly commands;

    readonly files;

    readonly git: SandboxGit;

    constructor(
        readonly sandboxId: string,
        channel: CloudRunExecChannel,
    ) {
        this.commands = channel.commands;
        this.files = channel.files;
        this.git = createGitOverCommands(channel.commands, channel.files);
    }
}

/**
 * Google **Cloud Run Sandboxes** provider (public preview, Jul 2026). Sandboxes
 * are gVisor-isolated execution boundaries spawned *inside* a Cloud Run service
 * instance deployed with `--sandbox-launcher`; a small gateway service (the
 * ComputeSDK Cloud Run gateway) fronts the in-instance `sandbox` CLI with an
 * HTTP API, which is what this provider drives — the backend itself runs
 * anywhere (locally in dev) and reaches sandboxes over HTTPS.
 *
 * Sandboxes see the *gateway container's filesystem* read-only with a writable
 * memory overlay, so the toolchain image is baked into the gateway deployment —
 * `spec.templateRef` cannot select a per-sandbox image and is ignored.
 *
 * No native suspend: like Docker this is a `pauseResume: false` backend —
 * `persist` tars the declared workspace to the {@link SnapshotStore} and
 * `resume` restores it into a fresh sandbox (`s3-tar` refs).
 *
 * Egress is binary on this backend (`--allow-egress` per sandbox, deny by
 * default): a non-empty spec allowlist coarsens to full egress, mirroring the
 * Lambda provider's INTERNET_EGRESS MVP posture.
 */
export class CloudRunSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = { pauseResume: false };

    private readonly client: CloudRunGatewayClient;

    constructor(
        config: CloudRunSandboxesConfig,
        private readonly logger: SandboxLogger,
        private readonly snapshotStore: SnapshotStore,
    ) {
        this.client = new CloudRunGatewayClient(
            config.sandboxUrl,
            config.sandboxSecret,
        );
    }

    async create(spec: SandboxSpec): Promise<SandboxHandle> {
        // Gateway sandbox ids must match [A-Za-z0-9_-]+.
        const sandboxId = `ld-${randomUUID()}`;
        const allowEgress = spec.egress.allow.length > 0;
        if (allowEgress) {
            this.logger.warn(
                `Cloud Run sandboxes enforce egress as all-or-nothing; coarsening the ${spec.egress.allow.length}-host allowlist to full egress (id=${sandboxId})`,
            );
        }
        await this.client.createSandbox({
            sandboxId,
            allowEgress,
            envs: spec.envs ?? null,
        });
        this.logger.info(`Cloud Run sandbox created (id=${sandboxId})`);
        return this.buildHandle(sandboxId);
    }

    async connect(sandboxId: string): Promise<SandboxHandle> {
        const handle = this.buildHandle(sandboxId);
        // The gateway has no real liveness endpoint — a trivial exec verifies
        // the sandbox still exists. Throws if it is gone; callers fall back to
        // create/resume.
        await handle.commands.run('true', { timeoutMs: 30_000 });
        return handle;
    }

    async destroy(sandboxId: string): Promise<void> {
        try {
            await this.client.destroySandbox(sandboxId);
            this.logger.info(`Cloud Run sandbox destroyed (id=${sandboxId})`);
        } catch (error) {
            // Cleanup path — already-gone sandboxes and transient gateway
            // errors are logged, not fatal.
            this.logger.warn(
                `Cloud Run sandbox destroy failed (id=${sandboxId}): ${String(
                    error,
                )}`,
            );
        }
    }

    /**
     * Tar the declared workspace inside the sandbox and push it to the snapshot
     * store — the same `s3-tar` shape the Docker provider writes, staged to a
     * file and read back as raw bytes. Does not delete the sandbox — the
     * Manager does that after persisting.
     */
    async persist(
        handle: SandboxHandle,
        options: PersistOptions,
    ): Promise<SnapshotRef> {
        const { workspace } = options;
        const snapshotKey = `sandboxes/${randomUUID()}/snapshot.tar.gz`;
        const archivePath = `/tmp/.ld-snapshot-${randomBytes(4).toString(
            'hex',
        )}.tar.gz`;
        const excludeFlags = workspace.exclude
            .map((pattern) => `--exclude=${shQuote(pattern)}`)
            .join(' ');
        const includeArgs = workspace.include
            .map((path) => shQuote(toArchiveRelative(path)))
            .join(' ');
        await handle.commands.run(
            `tar czf ${shQuote(archivePath)} --ignore-failed-read ${excludeFlags} -C / ${includeArgs}`,
            { timeoutMs: 120_000 },
        );
        try {
            const archive = await handle.files.readBytes(archivePath);
            await this.snapshotStore.put(snapshotKey, archive);
        } finally {
            await handle.files.remove(archivePath);
        }
        this.logger.info(
            `Cloud Run sandbox ${handle.sandboxId} persisted to ${snapshotKey} (${workspace.include.length} path(s))`,
        );
        return { kind: 's3-tar', key: snapshotKey };
    }

    /**
     * Create a fresh sandbox from `spec`, then download the snapshot tarball
     * and extract it `-C /` so the workspace lands back at its original paths.
     */
    async resume(ref: SnapshotRef, spec: SandboxSpec): Promise<SandboxHandle> {
        if (ref.kind !== 's3-tar') {
            throw new Error(
                `CloudRunSandboxProvider cannot resume a snapshot of kind '${ref.kind}'`,
            );
        }
        const handle = await this.create(spec);
        const archivePath = `/tmp/.ld-restore-${randomBytes(4).toString(
            'hex',
        )}.tar.gz`;
        const archive = await this.snapshotStore.get(ref.key);
        await handle.files.write(archivePath, archive);
        try {
            await handle.commands.run(`tar xzf ${shQuote(archivePath)} -C /`, {
                timeoutMs: 120_000,
            });
        } finally {
            await handle.files.remove(archivePath);
        }
        this.logger.info(
            `Cloud Run sandbox ${handle.sandboxId} resumed from ${ref.key}`,
        );
        return handle;
    }

    /** Delete the snapshot blob backing an s3-tar ref. */
    async deleteSnapshot(ref: SnapshotRef): Promise<void> {
        if (ref.kind !== 's3-tar') {
            return;
        }
        await this.snapshotStore.delete(ref.key);
    }

    private buildHandle(sandboxId: string): SandboxHandle {
        const channel = new CloudRunExecChannel(this.client, sandboxId);
        return new CloudRunSandboxHandle(sandboxId, channel);
    }
}

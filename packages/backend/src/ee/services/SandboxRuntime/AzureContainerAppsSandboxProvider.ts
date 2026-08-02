import { AzureSandboxExecChannel } from './AzureSandboxExecChannel';
import { createGitOverCommands } from './gitOverCommands';
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

/** Poll cadence + ceiling while waiting for a sandbox to reach `Running`.
 * Sandboxes provision from a warm pool (~sub-second) and resume sub-second. */
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 120_000;

/**
 * Azure Container Apps Sandboxes lifecycle states (data-plane top-level `state`).
 * `stop` (our suspend) lands the sandbox in `Stopped` — which, with the group's
 * Memory-mode lifecycle policy, is a resumable memory+disk snapshot. So `Stopped`
 * (like `Suspended`/`Idle`) is **resumable**; only `Deleting`/`Deleted` are terminal.
 */
const AzureSandboxState = {
    Creating: 'Creating',
    Running: 'Running',
    Idle: 'Idle',
    Suspended: 'Suspended',
    Resuming: 'Resuming',
    Stopping: 'Stopping',
    Stopped: 'Stopped',
    Deleting: 'Deleting',
    Deleted: 'Deleted',
} as const;

/** Sandbox states from which a `resume` re-materializes the sandbox. */
const RESUMABLE_STATES: readonly string[] = [
    AzureSandboxState.Stopped,
    AzureSandboxState.Suspended,
    AzureSandboxState.Idle,
];
/** States a sandbox can no longer be resumed from. */
const TERMINAL_STATES: readonly string[] = [
    AzureSandboxState.Deleting,
    AzureSandboxState.Deleted,
];

/** Map the configured resource tier to the API's cpu/memory requests. */
const TIER_RESOURCES: Record<string, { cpu: string; memory: string }> = {
    XS: { cpu: '250m', memory: '512Mi' },
    S: { cpu: '500m', memory: '1024Mi' },
    M: { cpu: '1000m', memory: '2048Mi' },
    L: { cpu: '2000m', memory: '4096Mi' },
};

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/** Static config the provider needs that does not vary per sandbox. The
 * per-feature `sandboxGroup` is resolved by the caller (one group + disk image
 * per feature, like the split images / Lambda ARNs on every other backend). */
export interface AzureSandboxesConfig {
    subscriptionId: string;
    resourceGroup: string;
    /** Region owning the sandbox group; selects the ADC data-plane endpoint. */
    region: string;
    /** This feature's sandbox group (management boundary). */
    sandboxGroup: string;
    /** ADC data-plane API version (query param on every call). */
    apiVersion: string;
    /** Entra token audience/scope for the ADC data plane. */
    tokenScope: string;
    /** Sandbox resource tier (`XS`/`S`/`M`/`L`). */
    resourceTier: string;
    /** Auto-suspend idle timeout fed to the group lifecycle policy (Memory mode). */
    autoSuspendIdleSeconds: number;
}

/**
 * The minimal slice of an `@azure/identity` `TokenCredential` the control plane
 * needs. A local interface (rather than importing the SDK here) so the provider
 * stays vendor-neutral and unit tests inject a fake; the SDK is only loaded in
 * the `createSandboxProvider` factory. `DefaultAzureCredential` satisfies this.
 */
export interface AzureTokenCredential {
    getToken(scopes: string | string[]): Promise<{ token: string } | null>;
}

/** A sandbox's current lifecycle state. */
export interface SandboxDescription {
    state: string;
}

/**
 * The slice of the Sandboxes ADC data plane the provider drives — sandbox
 * lifecycle + data-plane auth. A thin typed seam (mirroring the Lambda provider's
 * `MicrovmControlPlane`) so the provider stays testable with a fake and the
 * Azure SDK/REST never leaks into feature code.
 */
export interface SandboxGroupControlPlane {
    createSandbox(input: {
        diskImage: string;
        envs: Record<string, string> | null;
        egressAllow: string[];
        cpu: string;
        memory: string;
        autoSuspendIdleSeconds: number;
    }): Promise<{ sandboxId: string; state: string }>;
    getSandbox(sandboxId: string): Promise<SandboxDescription>;
    suspendSandbox(sandboxId: string): Promise<void>;
    resumeSandbox(sandboxId: string): Promise<void>;
    /** Idempotent: a no-op when the sandbox is already gone. */
    deleteSandbox(sandboxId: string): Promise<void>;
    /** Sandbox-scoped data-plane base URL for the {@link AzureSandboxExecChannel}. */
    dataPlaneBaseUrl(sandboxId: string): string;
    /** Mint an Entra bearer for the ADC data-plane audience. */
    getAccessToken(): Promise<string>;
}

/**
 * The real control plane over the Sandboxes ADC data plane
 * (`management.azuredevcompute.io`), authenticated with an Entra bearer for the
 * data-plane audience. Sandbox *group* provisioning is ARM and done out of band
 * (infra); every per-sandbox op here is a data-plane call.
 *
 * PINNED CONTRACT — the Sandboxes data-plane REST is not yet published (preview).
 * The endpoint host, sandbox path and api-version below are verified against the
 * `aca` CLI's own transport (`aca sandbox get --verbose`, PROD-8591); the
 * per-action sub-paths (`/exec`, `/files`, `/suspend`, `/resume`) and request
 * bodies are still inferred — confirm them against a running sandbox and correct
 * here only. Nothing above this class depends on the wire format.
 */
export class AzureSandboxGroupControlPlane implements SandboxGroupControlPlane {
    private readonly groupUrl: string;

    constructor(
        private readonly credential: AzureTokenCredential,
        private readonly config: AzureSandboxesConfig,
        private readonly logger: SandboxLogger,
    ) {
        // Regional ADC data-plane endpoint: `management.<region>.azuredevcompute.io`,
        // then the ARM-shaped sandbox-group path (no `/providers/Microsoft.App`).
        this.groupUrl =
            `https://management.${config.region}.azuredevcompute.io` +
            `/subscriptions/${config.subscriptionId}` +
            `/resourceGroups/${config.resourceGroup}` +
            `/sandboxGroups/${config.sandboxGroup}`;
    }

    async getAccessToken(): Promise<string> {
        const token = await this.credential.getToken(this.config.tokenScope);
        if (!token?.token) {
            throw new Error(
                `Failed to acquire an Entra token for scope ${this.config.tokenScope}`,
            );
        }
        return token.token;
    }

    dataPlaneBaseUrl(sandboxId: string): string {
        return `${this.groupUrl}/sandboxes/${sandboxId}`;
    }

    /** The `/sandboxes` collection URL — create PUTs here; the server assigns the id. */
    private sandboxesUrl(): string {
        const url = new URL(`${this.groupUrl}/sandboxes`);
        url.searchParams.set('api-version', this.config.apiVersion);
        return url.toString();
    }

    private sandboxUrl(sandboxId: string, action?: string): string {
        const url = new URL(
            `${this.groupUrl}/sandboxes/${sandboxId}${action ?? ''}`,
        );
        url.searchParams.set('api-version', this.config.apiVersion);
        return url.toString();
    }

    private async send(url: string, init: RequestInit): Promise<Response> {
        const token = await this.getAccessToken();
        return fetch(url, {
            ...init,
            headers: {
                ...init.headers,
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
            },
        });
    }

    async createSandbox(input: {
        diskImage: string;
        envs: Record<string, string> | null;
        egressAllow: string[];
        cpu: string;
        memory: string;
        autoSuspendIdleSeconds: number;
    }): Promise<{ sandboxId: string; state: string }> {
        const body = {
            // Our per-feature images are private disk images registered in the
            // group and addressed by their disk-image **id** (a UUID assigned at
            // registration — `input.diskImage` carries it). Public base images
            // (e.g. `ubuntu`) would instead be `{ isPublic: true, name }`.
            sourcesRef: {
                diskImage: { id: input.diskImage },
            },
            resources: { cpu: input.cpu, memory: input.memory },
            environment: input.envs ?? {},
            labels: { 'created-by': 'lightdash' },
            lifecycle: {
                autoSuspendPolicy: {
                    enabled: true,
                    interval: input.autoSuspendIdleSeconds,
                    mode: 'Memory',
                },
            },
            // Default-deny + an explicit allow rule per host — the recommended
            // posture for untrusted code. `Full` inspection enforces the Deny on
            // all traffic and blocks non-HTTP egress (rather than relying on the
            // platform default), so untrusted agent code can only reach the
            // allowlisted hosts over HTTP(S).
            egressPolicy: {
                defaultAction: 'Deny',
                trafficInspection: 'Full',
                hostRules: input.egressAllow.map((pattern) => ({
                    action: 'Allow',
                    pattern,
                })),
            },
        };
        // Create PUTs the /sandboxes collection; the server assigns the id.
        const response = await this.send(this.sandboxesUrl(), {
            method: 'PUT',
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(
                `Failed to create Azure sandbox (status=${response.status}): ${await response
                    .text()
                    .catch(() => '')}`,
            );
        }
        const json = (await response.json()) as {
            id?: string;
            state?: string;
        };
        if (!json.id) {
            throw new Error('Azure sandbox create returned no id');
        }
        this.logger.info(
            `Azure sandbox created (id=${json.id}, group=${this.config.sandboxGroup}, image=${input.diskImage})`,
        );
        return {
            sandboxId: json.id,
            state: json.state ?? AzureSandboxState.Creating,
        };
    }

    async getSandbox(sandboxId: string): Promise<SandboxDescription> {
        const response = await this.send(this.sandboxUrl(sandboxId), {
            method: 'GET',
        });
        if (!response.ok) {
            throw new Error(
                `Failed to get Azure sandbox ${sandboxId} (status=${response.status})`,
            );
        }
        const json = (await response.json()) as { state?: string };
        return { state: json.state ?? AzureSandboxState.Stopped };
    }

    async suspendSandbox(sandboxId: string): Promise<void> {
        // `stop` is the CLI/REST verb for suspend; with the group's Memory-mode
        // lifecycle policy it captures a memory+disk snapshot (sub-second resume).
        const response = await this.send(this.sandboxUrl(sandboxId, '/stop'), {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(
                `Failed to suspend Azure sandbox ${sandboxId} (status=${response.status})`,
            );
        }
    }

    async resumeSandbox(sandboxId: string): Promise<void> {
        const response = await this.send(
            this.sandboxUrl(sandboxId, '/resume'),
            { method: 'POST' },
        );
        if (!response.ok) {
            throw new Error(
                `Failed to resume Azure sandbox ${sandboxId} (status=${response.status})`,
            );
        }
    }

    async deleteSandbox(sandboxId: string): Promise<void> {
        const response = await this.send(this.sandboxUrl(sandboxId), {
            method: 'DELETE',
        });
        // 404 — already gone. Anything else non-2xx is logged, not fatal to cleanup.
        if (!response.ok && response.status !== 404) {
            this.logger.warn(
                `Azure sandbox delete failed (id=${sandboxId}, status=${response.status})`,
            );
        }
    }
}

class AzureSandboxHandle implements SandboxHandle {
    readonly commands;

    readonly files;

    readonly git: SandboxGit;

    constructor(
        readonly sandboxId: string,
        channel: AzureSandboxExecChannel,
    ) {
        this.commands = channel.commands;
        this.files = channel.files;
        this.git = createGitOverCommands(channel.commands, channel.files);
    }
}

/**
 * Azure Container Apps **Sandboxes** provider — a native-pause backend (the true
 * E2B / Lambda-MicroVM analog on Azure). The control plane
 * (`create`/`suspend`/`resume`/`delete`) maps 1:1 onto
 * `create`/`persist`/`resume`/`destroy`; suspend captures a full memory+disk
 * snapshot in place (sub-second resume), so there is no object-store snapshot and
 * no bespoke exec agent — the {@link AzureSandboxExecChannel} data plane speaks
 * the sandbox's native exec/file REST. See docs/sandbox-runtime.md.
 */
export class AzureContainerAppsSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = { pauseResume: true };

    constructor(
        private readonly controlPlane: SandboxGroupControlPlane,
        private readonly config: AzureSandboxesConfig,
        private readonly logger: SandboxLogger,
    ) {}

    async create(spec: SandboxSpec): Promise<SandboxHandle> {
        const { cpu, memory } =
            TIER_RESOURCES[this.config.resourceTier] ?? TIER_RESOURCES.M;
        const { sandboxId, state } = await this.controlPlane.createSandbox({
            diskImage: spec.templateRef,
            envs: spec.envs ?? null,
            egressAllow: spec.egress.allow,
            cpu,
            memory,
            autoSuspendIdleSeconds: this.config.autoSuspendIdleSeconds,
        });
        await this.waitForRunning(sandboxId, state);
        return this.buildHandle(sandboxId);
    }

    async connect(sandboxId: string): Promise<SandboxHandle> {
        const description = await this.controlPlane.getSandbox(sandboxId);
        await this.ensureRunning(sandboxId, description);
        return this.buildHandle(sandboxId);
    }

    async destroy(sandboxId: string): Promise<void> {
        await this.controlPlane.deleteSandbox(sandboxId);
        this.logger.info(`Azure sandbox deleted (id=${sandboxId})`);
    }

    // Native in-memory suspend IS the snapshot: the suspended sandbox keeps RAM,
    // disk and live processes, so the declared workspace is irrelevant here. The
    // ref is just the sandbox id to resume.
    async persist(
        handle: SandboxHandle,
        _options: PersistOptions,
    ): Promise<SnapshotRef> {
        await this.controlPlane.suspendSandbox(handle.sandboxId);
        this.logger.info(`Azure sandbox suspended (id=${handle.sandboxId})`);
        return { kind: 'azure-sandbox-suspended', sandboxId: handle.sandboxId };
    }

    async resume(ref: SnapshotRef, _spec: SandboxSpec): Promise<SandboxHandle> {
        if (ref.kind !== 'azure-sandbox-suspended') {
            throw new Error(
                `AzureContainerAppsSandboxProvider cannot resume a snapshot of kind '${ref.kind}'`,
            );
        }
        return this.connect(ref.sandboxId);
    }

    // eslint-disable-next-line class-methods-use-this
    async deleteSnapshot(_ref: SnapshotRef): Promise<void> {
        // The suspended sandbox IS the snapshot; destroy(sandboxId) →
        // deleteSandbox reclaims it, so there is no separate blob to delete.
    }

    /** Resume a suspended/stopped/idle sandbox (or accept a running one); reject terminal ones. */
    private async ensureRunning(
        sandboxId: string,
        description: SandboxDescription,
    ): Promise<void> {
        if (TERMINAL_STATES.includes(description.state)) {
            throw new Error(
                `Azure sandbox ${sandboxId} is ${description.state} and can no longer be resumed`,
            );
        }
        if (description.state === AzureSandboxState.Running) {
            return;
        }
        if (RESUMABLE_STATES.includes(description.state)) {
            await this.controlPlane.resumeSandbox(sandboxId);
        }
        await this.waitForRunning(sandboxId, description.state);
    }

    /** Poll `getSandbox` until `Running`. Fails closed on a terminal state or timeout. */
    private async waitForRunning(
        sandboxId: string,
        currentState: string,
    ): Promise<void> {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let state = currentState;
        while (state !== AzureSandboxState.Running) {
            if (TERMINAL_STATES.includes(state)) {
                throw new Error(
                    `Azure sandbox ${sandboxId} entered ${state} while waiting for Running`,
                );
            }
            if (Date.now() > deadline) {
                throw new Error(
                    `Azure sandbox ${sandboxId} did not reach Running within ${POLL_TIMEOUT_MS}ms (last state ${state})`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(POLL_INTERVAL_MS);
            // eslint-disable-next-line no-await-in-loop
            const description = await this.controlPlane.getSandbox(sandboxId);
            state = description.state;
        }
    }

    private buildHandle(sandboxId: string): SandboxHandle {
        const channel = new AzureSandboxExecChannel(
            this.controlPlane.dataPlaneBaseUrl(sandboxId),
            this.config.apiVersion,
            () => this.controlPlane.getAccessToken(),
        );
        return new AzureSandboxHandle(sandboxId, channel);
    }
}

import {
    LambdaMicrovms,
    MicrovmState,
    ResourceNotFoundException,
} from '@aws-sdk/client-lambda-microvms';
import { createGitOverCommands } from './gitOverCommands';
import { LambdaExecChannel } from './LambdaExecChannel';
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

/** Token TTL for the data-plane bearer. AWS caps this at 60 minutes, which
 * matches our per-turn sandbox ceiling; the channel re-mints on a 401/403. */
const AUTH_TOKEN_TTL_MINUTES = 60;
/** AWS hard cap on a microVM's total lifetime (8 hours). */
const MAX_DURATION_SECONDS = 28_800;
/** Poll cadence + ceiling while waiting for `PENDING`/`SUSPENDED` → `RUNNING`.
 * Real timings are ~5s to RUNNING and ~1s to resume. */
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 120_000;

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/** A microVM's lifecycle state + current HTTPS proxy endpoint. */
export interface MicrovmDescription {
    state: string;
    endpoint: string;
}

/**
 * The slice of the Lambda MicroVMs control plane the provider drives. A thin,
 * typed seam over the AWS SDK so the provider stays vendor-neutral and unit
 * tests inject a fake (mirroring how `AiWritebackService.test.ts` drives a fake
 * `SandboxProvider`) without loading the SDK.
 */
export interface MicrovmControlPlane {
    runMicrovm(input: {
        imageIdentifier: string;
        executionRoleArn: string | null;
        ingressNetworkConnectors: string[];
        egressNetworkConnectors: string[];
        idlePolicy: {
            maxIdleDurationSeconds: number;
            suspendedDurationSeconds: number;
            autoResumeEnabled: boolean;
        };
        maximumDurationInSeconds: number;
        runHookPayload: string | null;
    }): Promise<{ microVmId: string; endpoint: string; state: string }>;
    getMicrovm(microVmId: string): Promise<MicrovmDescription>;
    suspendMicrovm(microVmId: string): Promise<void>;
    resumeMicrovm(microVmId: string): Promise<void>;
    /** Idempotent: a no-op when the microVM is already gone. */
    terminateMicrovm(microVmId: string): Promise<void>;
    /** Mint the `X-aws-proxy-auth` bearer value for the data plane. */
    createAuthToken(microVmId: string): Promise<string>;
}

/**
 * The real control plane backed by `@aws-sdk/client-lambda-microvms`. Maps the
 * SDK's request/response shapes onto {@link MicrovmControlPlane} and normalizes
 * the one error we treat specially (terminate is idempotent).
 */
export class AwsMicrovmControlPlane implements MicrovmControlPlane {
    constructor(private readonly client: LambdaMicrovms) {}

    async runMicrovm(
        input: Parameters<MicrovmControlPlane['runMicrovm']>[0],
    ): Promise<{ microVmId: string; endpoint: string; state: string }> {
        const response = await this.client.runMicrovm({
            imageIdentifier: input.imageIdentifier,
            ...(input.executionRoleArn
                ? { executionRoleArn: input.executionRoleArn }
                : {}),
            ingressNetworkConnectors: input.ingressNetworkConnectors,
            egressNetworkConnectors: input.egressNetworkConnectors,
            idlePolicy: input.idlePolicy,
            maximumDurationInSeconds: input.maximumDurationInSeconds,
            ...(input.runHookPayload
                ? { runHookPayload: input.runHookPayload }
                : {}),
        });
        if (!response.microvmId || !response.endpoint || !response.state) {
            throw new Error(
                'RunMicrovm returned an incomplete response (missing id/endpoint/state)',
            );
        }
        return {
            microVmId: response.microvmId,
            endpoint: response.endpoint,
            state: response.state,
        };
    }

    async getMicrovm(microVmId: string): Promise<MicrovmDescription> {
        const response = await this.client.getMicrovm({
            microvmIdentifier: microVmId,
        });
        if (!response.state || !response.endpoint) {
            throw new Error(
                `GetMicrovm for ${microVmId} returned an incomplete response (missing state/endpoint)`,
            );
        }
        return { state: response.state, endpoint: response.endpoint };
    }

    async suspendMicrovm(microVmId: string): Promise<void> {
        await this.client.suspendMicrovm({ microvmIdentifier: microVmId });
    }

    async resumeMicrovm(microVmId: string): Promise<void> {
        await this.client.resumeMicrovm({ microvmIdentifier: microVmId });
    }

    async terminateMicrovm(microVmId: string): Promise<void> {
        try {
            await this.client.terminateMicrovm({
                microvmIdentifier: microVmId,
            });
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                return;
            }
            throw error;
        }
    }

    async createAuthToken(microVmId: string): Promise<string> {
        const response = await this.client.createMicrovmAuthToken({
            microvmIdentifier: microVmId,
            expirationInMinutes: AUTH_TOKEN_TTL_MINUTES,
            allowedPorts: [{ allPorts: {} }],
        });
        const token = response.authToken?.['X-aws-proxy-auth'];
        if (!token) {
            throw new Error(
                `CreateMicrovmAuthToken for ${microVmId} did not return an X-aws-proxy-auth token`,
            );
        }
        return token;
    }
}

/** Static config the provider needs that does not vary per sandbox. */
export interface LambdaMicroVmConfig {
    executionRoleArn: string | null;
    ingressConnectorArn: string;
    egressConnectorArn: string;
    maxIdleDurationSeconds: number;
    suspendedDurationSeconds: number;
}

class LambdaMicroVmSandboxHandle implements SandboxHandle {
    readonly commands;

    readonly files;

    readonly git: SandboxGit;

    constructor(
        readonly sandboxId: string,
        channel: LambdaExecChannel,
        private readonly suspendSelf: () => Promise<void>,
    ) {
        this.commands = channel.commands;
        this.files = channel.files;
        this.git = createGitOverCommands(channel.commands, channel.files);
    }

    // Native suspend IS the snapshot (memory+disk+processes).
    async pause(): Promise<void> {
        await this.suspendSelf();
    }
}

/**
 * AWS Lambda MicroVMs provider — a native-pause backend. The
 * control plane (`RunMicrovm`/`Suspend`/`Resume`/`Terminate`) maps 1:1 onto
 * `create`/`persist`/`resume`/`destroy`; the genuinely new piece is the
 * {@link LambdaExecChannel} data plane (HTTPS to an in-microVM agent), because
 * Lambda ships no native exec SDK.
 */
export class LambdaMicroVmSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = {
        isolation: 'microvm',
        pauseResume: true,
        persistence: 'memory',
        // MVP routes egress through the managed open `INTERNET_EGRESS` connector,
        // so the provider cannot enforce `SandboxSpec.egress`. A custom VPC egress
        // connector (later hardening) is what flips this to `true`.
        egressAllowlist: false,
        warmPool: false,
    };

    constructor(
        private readonly controlPlane: MicrovmControlPlane,
        private readonly config: LambdaMicroVmConfig,
        private readonly logger: SandboxLogger,
    ) {}

    async create(spec: SandboxSpec): Promise<SandboxHandle> {
        const { microVmId, state } = await this.controlPlane.runMicrovm({
            imageIdentifier: spec.templateRef,
            executionRoleArn: this.config.executionRoleArn,
            ingressNetworkConnectors: [this.config.ingressConnectorArn],
            egressNetworkConnectors: [this.config.egressConnectorArn],
            idlePolicy: {
                maxIdleDurationSeconds: this.config.maxIdleDurationSeconds,
                suspendedDurationSeconds: this.config.suspendedDurationSeconds,
                autoResumeEnabled: true,
            },
            maximumDurationInSeconds: Math.min(
                Math.max(1, Math.floor(spec.timeoutMs / 1000)),
                MAX_DURATION_SECONDS,
            ),
            runHookPayload: spec.envs
                ? JSON.stringify({ envs: spec.envs })
                : null,
        });
        this.logger.info(
            `Lambda microVM created (id=${microVmId}, image=${spec.templateRef})`,
        );
        const endpoint = await this.waitForRunning(microVmId, state);
        return this.buildHandle(microVmId, endpoint);
    }

    async connect(microVmId: string): Promise<SandboxHandle> {
        const description = await this.controlPlane.getMicrovm(microVmId);
        const endpoint = await this.ensureRunning(microVmId, description);
        return this.buildHandle(microVmId, endpoint);
    }

    async destroy(microVmId: string): Promise<void> {
        await this.controlPlane.terminateMicrovm(microVmId);
        this.logger.info(`Lambda microVM terminated (id=${microVmId})`);
    }

    async pause(microVmId: string): Promise<void> {
        await this.controlPlane.suspendMicrovm(microVmId);
    }

    // Native in-memory suspend IS the snapshot: the suspended microVM keeps RAM,
    // disk and live processes, so the declared workspace is irrelevant here. The
    // ref is just the microVM id to resume.
    async persist(
        handle: SandboxHandle,
        _options: PersistOptions,
    ): Promise<SnapshotRef> {
        await this.controlPlane.suspendMicrovm(handle.sandboxId);
        return {
            kind: 'lambda-microvm-suspended',
            microVmId: handle.sandboxId,
        };
    }

    async resume(ref: SnapshotRef, _spec: SandboxSpec): Promise<SandboxHandle> {
        if (ref.kind !== 'lambda-microvm-suspended') {
            throw new Error(
                `LambdaMicroVmSandboxProvider cannot resume a snapshot of kind '${ref.kind}'`,
            );
        }
        return this.connect(ref.microVmId);
    }

    // eslint-disable-next-line class-methods-use-this
    async deleteSnapshot(_ref: SnapshotRef): Promise<void> {
        // The suspended microVM IS the snapshot; destroy(microVmId) →
        // TerminateMicrovm reclaims it, so there is no separate blob to delete.
    }

    /** Resume a suspended microVM (or accept a running one); reject terminal ones. */
    private async ensureRunning(
        microVmId: string,
        description: MicrovmDescription,
    ): Promise<string> {
        if (
            description.state === MicrovmState.TERMINATED ||
            description.state === MicrovmState.TERMINATING
        ) {
            throw new Error(
                `Lambda microVM ${microVmId} is ${description.state} and can no longer be resumed`,
            );
        }
        if (description.state === MicrovmState.RUNNING) {
            return description.endpoint;
        }
        if (
            description.state === MicrovmState.SUSPENDED ||
            description.state === MicrovmState.SUSPENDING
        ) {
            await this.controlPlane.resumeMicrovm(microVmId);
        }
        return this.waitForRunning(microVmId, description.state);
    }

    /**
     * Poll `GetMicrovm` until `RUNNING`, re-reading the endpoint each time (it is
     * a separate, stable hostname — see §0). Fails closed on a terminal state or
     * timeout.
     */
    private async waitForRunning(
        microVmId: string,
        currentState: string,
    ): Promise<string> {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let state = currentState;
        while (state !== MicrovmState.RUNNING) {
            if (
                state === MicrovmState.TERMINATED ||
                state === MicrovmState.TERMINATING
            ) {
                throw new Error(
                    `Lambda microVM ${microVmId} entered ${state} while waiting for RUNNING`,
                );
            }
            if (Date.now() > deadline) {
                throw new Error(
                    `Lambda microVM ${microVmId} did not reach RUNNING within ${POLL_TIMEOUT_MS}ms (last state ${state})`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(POLL_INTERVAL_MS);
            // eslint-disable-next-line no-await-in-loop
            const description = await this.controlPlane.getMicrovm(microVmId);
            state = description.state;
            if (state === MicrovmState.RUNNING) {
                return description.endpoint;
            }
        }
        const description = await this.controlPlane.getMicrovm(microVmId);
        return description.endpoint;
    }

    private buildHandle(microVmId: string, endpoint: string): SandboxHandle {
        const channel = new LambdaExecChannel(endpoint, () =>
            this.controlPlane.createAuthToken(microVmId),
        );
        return new LambdaMicroVmSandboxHandle(microVmId, channel, () =>
            this.controlPlane.suspendMicrovm(microVmId),
        );
    }
}

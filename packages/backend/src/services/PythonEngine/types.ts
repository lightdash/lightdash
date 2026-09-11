import type { DimensionType } from '@lightdash/common';

/**
 * The contract between a Python stage and whatever runs its code. Everything
 * above this boundary — the composer node, reference resolution, result
 * registration — is executor-agnostic, so a deployment swaps a WASM
 * interpreter for a microVM pool or a hosted sandbox by configuration alone.
 *
 * The boundary holds only while a request stays serializable and free of
 * Lightdash identity: no account, no project, no database handle, no
 * warehouse client. Ask whether a request could be an HTTP call to a third
 * party. When the answer is no, the remote executors stop being an option.
 */

/**
 * The function the executor calls, with the input tables as arguments. The
 * name is a convention rather than a request field, so no caller chooses a
 * symbol the sandbox then has to validate.
 */
export const PYTHON_STAGE_ENTRYPOINT = 'transform';

/** A result the stage reads, bound to a name in the Python namespace. */
export type PythonInputTable = {
    tableName: string;
    /** Object storage URI of the Parquet file that holds the rows. */
    uri: string;
};

/**
 * Credentials the executor uses to read the inputs and write the output.
 * `scope` restricts them to those URIs and nothing else, which is what keeps
 * one tenant's stage away from another tenant's results. Mint them
 * short-lived: a remote executor holds them for the life of the run.
 */
export type PythonStorageCredentials = {
    endpoint: string;
    region: string | null;
    accessKey: string;
    secretKey: string;
    sessionToken: string | null;
    forcePathStyle: boolean;
    useSsl: boolean;
    /** Every input URI plus the output URI. The executor reaches no other object. */
    scope: string[];
};

/**
 * Bounds the executor enforces. A run that crosses one stops and reports
 * `limitExceeded`, so the caller distinguishes a stage that asks for too much
 * from a stage whose code is wrong.
 */
export type PythonRunLimits = {
    memoryMb: number;
    wallClockMs: number;
    maxOutputRows: number;
};

/**
 * A prebuilt set of Python packages, identified rather than resolved. The
 * executor installs nothing at run time: resolution costs start-up latency
 * and admits a supply chain the sandbox cannot vet.
 */
export type PythonPackageSetId = string;

export type PythonRunRequest = {
    /** Python source that defines {@link PYTHON_STAGE_ENTRYPOINT}. */
    code: string;
    packageSetId: PythonPackageSetId;
    inputs: PythonInputTable[];
    /** Object storage URI the stage writes its result Parquet file to. */
    outputUri: string;
    credentials: PythonStorageCredentials;
    limits: PythonRunLimits;
};

/**
 * Durations every executor reports, whatever the outcome. They make cold
 * start comparable across implementations, which is how a deployment decides
 * whether a heavier sandbox earns its cost.
 */
export type PythonRunTimings = {
    /** Milliseconds spent preparing the interpreter before the code runs. */
    startupMs: number;
    executionMs: number;
    peakMemoryMb: number | null;
};

/** A column of the written Parquet file, derived from its Arrow schema. */
export type PythonResultColumn = {
    name: string;
    type: DimensionType;
};

export type PythonRunSuccess = {
    status: 'success';
    /** Columns in the order the stage produced them. */
    columns: PythonResultColumn[];
    rowCount: number;
};

/**
 * The code raised. The caller shows the traceback to whoever wrote the code
 * and lets them try again.
 */
export type PythonRunUserError = {
    status: 'userError';
    message: string;
    traceback: string | null;
};

export type PythonRunLimitKind = keyof PythonRunLimits;

/**
 * The run crossed one of its bounds. The code may be correct, so the caller
 * retries over less data rather than reporting a defect.
 */
export type PythonRunLimitExceeded = {
    status: 'limitExceeded';
    limit: PythonRunLimitKind;
    message: string;
};

/** The caller aborted the run. Nobody is waiting for the result. */
export type PythonRunCanceled = {
    status: 'canceled';
};

/**
 * The sandbox itself failed: it did not start, it lost its storage, or it
 * died for a reason the code does not explain. Treat it as an incident
 * rather than feedback, and never show its message as a code error.
 */
export type PythonRunExecutorError = {
    status: 'executorError';
    message: string;
};

export type PythonRunOutcome =
    | PythonRunSuccess
    | PythonRunUserError
    | PythonRunLimitExceeded
    | PythonRunCanceled
    | PythonRunExecutorError;

/**
 * Timings accompany every outcome, so reporting them is part of the shape
 * rather than a convention each executor keeps on its own.
 */
export type PythonRunResult = {
    outcome: PythonRunOutcome;
    timings: PythonRunTimings;
};

/** Identifies the executor in logs, metrics and query history. */
export type PythonExecutorDefinition = {
    id: string;
    label: string;
};

/**
 * Runs one Python stage. Implementations read the inputs, call the
 * entrypoint, write the output Parquet file, and report what happened.
 * They hold no state between runs: a caller that submits the same request
 * twice gets two independent executions.
 */
export interface PythonExecutor {
    definition: PythonExecutorDefinition;
    run(
        request: PythonRunRequest,
        signal: AbortSignal,
    ): Promise<PythonRunResult>;
}

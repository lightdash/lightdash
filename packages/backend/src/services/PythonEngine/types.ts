import type { DimensionType } from '@lightdash/common';

/**
 * The contract between a Python stage and the sandbox that runs its code.
 * The composer node, reference resolution and result registration sit above
 * it and do not change with the executor.
 *
 * A request stays serializable and carries no account, project, database
 * handle or warehouse client. That is what lets an executor be a remote
 * sandbox rather than an in-process interpreter.
 */

/**
 * The function the executor calls, with the input tables as arguments. Fixed
 * rather than a request field, so no caller supplies a symbol to validate.
 */
export const PYTHON_STAGE_ENTRYPOINT = 'transform';

/** A result the stage reads, bound to a name in the Python namespace. */
export type PythonInputTable = {
    tableName: string;
    /** Object storage URI of the Parquet file that holds the rows. */
    uri: string;
};

/**
 * Credentials for the inputs and the output. `scope` restricts them to those
 * URIs and no others. Mint them short-lived: a remote executor holds them
 * for the length of the run.
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

/** Bounds the executor enforces. Crossing one stops the run with `limitExceeded`. */
export type PythonRunLimits = {
    memoryMb: number;
    wallClockMs: number;
    maxOutputRows: number;
};

/**
 * A prebuilt set of Python packages, named rather than resolved. The executor
 * installs nothing at run time: resolution costs start-up latency and pulls
 * in packages nothing has reviewed.
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
 * Reported on every outcome. Start-up cost is the main difference between
 * candidate sandboxes, so it has to be measurable.
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

/** The code raised. Show the traceback to whoever wrote it. */
export type PythonRunUserError = {
    status: 'userError';
    message: string;
    traceback: string | null;
};

export type PythonRunLimitKind = keyof PythonRunLimits;

/** The run crossed a bound. The code may be correct, so retry over fewer rows. */
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
 * The sandbox failed: it did not start, lost its storage, or died for a
 * reason the code does not explain. Not a code error, so do not show the
 * message as one.
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

/** Timings sit outside the union so every outcome reports them. */
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
 * Runs one Python stage: read the inputs, call the entrypoint, write the
 * output Parquet file, report what happened. Implementations hold no state
 * between runs, so the same request twice runs twice.
 */
export interface PythonExecutor {
    definition: PythonExecutorDefinition;
    run(
        request: PythonRunRequest,
        signal: AbortSignal,
    ): Promise<PythonRunResult>;
}

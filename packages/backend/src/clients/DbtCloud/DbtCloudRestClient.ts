import {
    DEFAULT_DBT_CLOUD_BASE_URL,
    ParameterError,
    TERMINAL_RUN_STATUSES,
    type DbtCloudJobResponse,
    type DbtCloudRunStatusResponse,
    type DbtCloudTriggerRunResponse,
} from '@lightdash/common';
import Logger from '../../logging/logger';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 600_000; // 10 minutes

type DbtCloudRestClientArgs = {
    serviceToken: string;
    accountId: string;
    baseUrl?: string;
};

export class DbtCloudRestClient {
    private readonly serviceToken: string;

    private readonly accountId: string;

    private readonly baseUrl: string;

    constructor({ serviceToken, accountId, baseUrl }: DbtCloudRestClientArgs) {
        if (!serviceToken) {
            throw new ParameterError('dbt Cloud service token is required');
        }
        if (!accountId) {
            throw new ParameterError('dbt Cloud account ID is required');
        }
        this.serviceToken = serviceToken;
        this.accountId = accountId;
        this.baseUrl = (baseUrl || DEFAULT_DBT_CLOUD_BASE_URL).replace(
            /\/$/,
            '',
        );
    }

    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}/api/v2/accounts/${this.accountId}${path}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Token ${this.serviceToken}`,
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new ParameterError(
                `dbt Cloud API error (${response.status}): ${errorBody}`,
            );
        }

        const json = (await response.json()) as { data: T };
        return json.data;
    }

    async getJob(jobId: string): Promise<DbtCloudJobResponse> {
        const raw = await this.request<Record<string, unknown>>(
            `/jobs/${jobId}/`,
        );
        return {
            id: raw.id as number,
            name: raw.name as string,
            jobType: raw.job_type as string,
            environmentId: raw.environment_id as number,
            executeSteps: raw.execute_steps as string[],
            settings: raw.settings as { threads: number; targetName: string },
            deferringEnvironmentId:
                (raw.deferring_environment_id as number | null) ?? null,
        };
    }

    async triggerRun({
        jobId,
        gitBranch,
        cause,
        stepsOverride,
    }: {
        jobId: string;
        gitBranch: string;
        cause?: string;
        stepsOverride?: string[];
    }): Promise<DbtCloudTriggerRunResponse> {
        const body: Record<string, unknown> = {
            cause: cause ?? `Lightdash branch preview for ${gitBranch}`,
            git_branch: gitBranch,
        };
        if (stepsOverride) {
            body.steps_override = stepsOverride;
        }

        const raw = await this.request<Record<string, unknown>>(
            `/jobs/${jobId}/run/`,
            {
                method: 'POST',
                body: JSON.stringify(body),
            },
        );
        return { runId: raw.id as number };
    }

    async getRunStatus(runId: number): Promise<DbtCloudRunStatusResponse> {
        const raw = await this.request<Record<string, unknown>>(
            `/runs/${runId}/`,
        );
        return {
            runId: raw.id as number,
            status: raw.status as number,
            statusHumanized: raw.status_humanized as string,
            finishedAt: (raw.finished_at as string | null) ?? null,
        };
    }

    async getArtifact<T = unknown>(
        runId: number,
        artifactPath: string,
    ): Promise<T> {
        return this.request<T>(`/runs/${runId}/artifacts/${artifactPath}`);
    }

    async pollRunUntilComplete(
        runId: number,
        options?: {
            timeoutMs?: number;
            intervalMs?: number;
        },
    ): Promise<DbtCloudRunStatusResponse> {
        const timeoutMs = options?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
        const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        const startTime = Date.now();

        const poll = async (): Promise<DbtCloudRunStatusResponse> => {
            const status = await this.getRunStatus(runId);

            if (
                TERMINAL_RUN_STATUSES.includes(
                    status.status as (typeof TERMINAL_RUN_STATUSES)[number],
                )
            ) {
                return status;
            }

            if (Date.now() - startTime > timeoutMs) {
                throw new ParameterError(
                    `dbt Cloud run ${runId} timed out after ${timeoutMs / 1000}s (last status: ${status.statusHumanized})`,
                );
            }

            Logger.debug(
                `dbt Cloud run ${runId} status: ${status.statusHumanized}, polling again in ${intervalMs / 1000}s`,
            );

            await new Promise((resolve) => {
                setTimeout(resolve, intervalMs);
            });

            return poll();
        };

        return poll();
    }
}

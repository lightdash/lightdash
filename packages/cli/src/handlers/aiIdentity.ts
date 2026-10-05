import {
    AiIdentityJobStatus,
    AiIdentityState,
    getAiIdentityPersonLabel,
    ParameterError,
    validateAiIdentityRoleTemplate,
    type AiAccessForUser,
    type AiIdentity,
    type AiIdentityAccount,
    type AiIdentityFilter,
    type AiIdentityJob,
    type AiIdentityListResult,
} from '@lightdash/common';
import columnify from 'columnify';
import { writeFile } from 'fs/promises';
import fetch from 'node-fetch';
import { getConfig } from '../config';
import { lightdashApi } from './dbt/apiClient';

const baseUrl = '/api/v2/org/ai-identities';

type IdentityListOptions = {
    account?: string;
    pending?: boolean;
    failed?: boolean;
    needsSignIn?: boolean;
    state?: string;
    format?: 'table' | 'json' | 'sql' | 'csv';
    roleTemplate?: string;
    role?: string;
    roles?: boolean;
    output?: string;
};

type IdentityTestOptions = {
    account?: string;
    failed?: boolean;
    all?: boolean;
};

const writeOutput = async (text: string, output?: string): Promise<void> => {
    if (output) await writeFile(output, text, 'utf8');
    else process.stdout.write(text);
};

const resolveAccount = async (account?: string): Promise<string> => {
    const accounts = await lightdashApi<AiIdentityAccount[]>({
        method: 'GET',
        url: `${baseUrl}/accounts`,
        body: undefined,
    });
    if (account) {
        if (!accounts.some((item) => item.aiIdentityAccountUuid === account)) {
            throw new ParameterError('The AI identity account was not found.');
        }
        return account;
    }
    if (accounts.length === 1) return accounts[0].aiIdentityAccountUuid;
    if (accounts.length === 0)
        throw new ParameterError('No AI identity accounts are available.');
    process.stderr.write(
        `${columnify(accounts.map((item) => ({ account: item.aiIdentityAccountUuid, snowflakeAccount: item.snowflakeAccount })))}\n`,
    );
    throw new ParameterError('Choose an account with --account <uuid>.');
};

const getStates = (options: IdentityListOptions): AiIdentityState[] => {
    const states: AiIdentityState[] = [];
    if (options.pending) states.push(AiIdentityState.PENDING);
    if (options.failed) states.push(AiIdentityState.FAILED);
    if (options.needsSignIn) states.push(AiIdentityState.NEEDS_SIGN_IN);
    if (options.state) {
        const state = Object.values(AiIdentityState).find(
            (value) => value === options.state,
        );
        if (!state)
            throw new ParameterError(
                `Unknown AI identity state: ${options.state}`,
            );
        states.push(state);
    }
    if (states.length > 1)
        throw new ParameterError('Choose only one state filter.');
    return states;
};

const makeFilter = (
    account: string,
    states: AiIdentityState[],
): AiIdentityFilter => ({
    aiIdentityAccountUuid: account,
    states,
    reasons: [],
    projectUuid: null,
    search: null,
    staleOnly: false,
});

const pollJob = async (job: AiIdentityJob): Promise<AiIdentityJob> => {
    if (
        job.status === AiIdentityJobStatus.QUEUED ||
        job.status === AiIdentityJobStatus.RUNNING
    ) {
        if (job.total > 0)
            process.stderr.write(`Exporting ${job.done} of ${job.total}…\n`);
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 2000);
        });
        const nextJob = await lightdashApi<AiIdentityJob>({
            method: 'GET',
            url: `${baseUrl}/jobs/${encodeURIComponent(job.jobUuid)}`,
            body: undefined,
        });
        return pollJob(nextJob);
    }
    if (job.status === AiIdentityJobStatus.FAILED)
        throw new ParameterError(
            `Export failed: ${job.error ?? 'The AI identity job failed.'}`,
        );
    if (job.status !== AiIdentityJobStatus.DONE)
        throw new Error(`Unknown job status: ${job.status}`);
    process.stderr.write(`done: ${job.done}/${job.total}\n`);
    return job;
};

const relativeTime = (value: Date): string => {
    const seconds = (new Date(value).getTime() - Date.now()) / 1000;
    const units = [
        ['year', 365 * 86400],
        ['month', 30 * 86400],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
        ['second', 1],
    ] as const;
    const [unit, duration] =
        units.find(([, size]) => Math.abs(seconds) >= size) ??
        units[units.length - 1];
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        Math.round(seconds / duration),
        unit,
    );
};

export const aiIdentityHandler = async (options: {
    project?: string;
    format?: 'table' | 'json';
}): Promise<void> => {
    const config = await getConfig();
    const projectUuid =
        options.project ??
        process.env.LIGHTDASH_PROJECT_UUID ??
        config.context?.project;
    if (!projectUuid)
        throw new ParameterError(
            'Select a project with --project <uuid> or lightdash config set-project.',
        );
    const access = await lightdashApi<AiAccessForUser>({
        method: 'GET',
        url: `/api/v2/user/me/ai-access?${new URLSearchParams({ projectUuid })}`,
        body: undefined,
    });
    if (options.format === 'json') {
        await writeOutput(`${JSON.stringify(access, null, 2)}\n`);
        return;
    }
    process.stdout.write(
        `${columnify([
            {
                state:
                    access.state === null
                        ? 'Not required'
                        : getAiIdentityPersonLabel(access.state),
                identity: access.aiIdentityName ?? '-',
                lastCheck:
                    access.lastCheckedAt === null
                        ? 'never'
                        : relativeTime(access.lastCheckedAt),
                action: access.message ?? 'No action needed.',
            },
        ])}\n`,
    );
};

export const aiIdentitiesListHandler = async (
    options: IdentityListOptions,
): Promise<void> => {
    if (
        [
            options.role,
            options.roleTemplate,
            options.roles === false ? 'none' : undefined,
        ].filter((value) => value !== undefined).length > 1
    )
        throw new ParameterError(
            'Choose either --role, --role-template or --no-roles.',
        );
    const roleForTwin =
        options.roles === false ? null : (options.roleTemplate ?? options.role);
    if (roleForTwin !== undefined) {
        if (options.format !== 'sql' && options.format !== 'json')
            throw new ParameterError(
                'Role options require --format sql or json.',
            );
        if (roleForTwin !== null) validateAiIdentityRoleTemplate(roleForTwin);
    }
    const states = getStates(options);
    const format = options.format ?? 'table';
    if (!['table', 'json', 'sql', 'csv'].includes(format))
        throw new ParameterError('Format must be table, json, sql or csv.');
    const account = await resolveAccount(options.account);
    const filter = makeFilter(account, states);
    if (format === 'sql' || format === 'csv' || format === 'json') {
        const job = await pollJob(
            await lightdashApi<AiIdentityJob>({
                method: 'POST',
                url: `${baseUrl}/export`,
                body: JSON.stringify({
                    filter,
                    format,
                    ...(roleForTwin === undefined ? {} : { roleForTwin }),
                }),
            }),
        );
        if (!job.fileUrl)
            throw new Error('The export job has no download URL.');
        const response = await fetch(job.fileUrl);
        if (!response.ok)
            throw new Error(`The export download failed (${response.status}).`);
        await writeOutput(await response.text(), options.output);
        if (job.skipped?.length)
            process.stderr.write(
                `Warning: skipped ${job.skipped.length === 1 ? '1 person' : `${job.skipped.length} people`}; ${format === 'sql' ? 'see the comment at the top' : 'see skipped'}\n`,
            );
        return;
    }
    const identities: AiIdentity[] = [];
    const readPage = async (page: number): Promise<void> => {
        const params = new URLSearchParams({
            aiIdentityAccountUuid: account,
            page: String(page),
            pageSize: '100',
        });
        if (states.length) params.set('state', states[0]);
        const result = await lightdashApi<AiIdentityListResult>({
            method: 'GET',
            url: `${baseUrl}?${params}`,
            body: undefined,
        });
        identities.push(...result.data);
        if (page < result.pagination.totalPageCount) await readPage(page + 1);
    };
    await readPage(1);
    const text = columnify(
        identities.map((identity) => ({
            person: identity.email,
            identity: identity.twinName ?? '-',
            state: identity.state,
            lastCheck:
                identity.checkedAt === null
                    ? 'never'
                    : relativeTime(identity.checkedAt),
            reason: identity.failureReason ?? '-',
        })),
    );
    await writeOutput(`${text}\n`, options.output);
};

export const aiIdentitiesTestHandler = async (
    options: IdentityTestOptions,
): Promise<void> => {
    if (options.failed && options.all)
        throw new ParameterError('Choose either --failed or --all.');
    const account = await resolveAccount(options.account);
    const filter = makeFilter(
        account,
        options.failed ? [AiIdentityState.FAILED] : [],
    );
    await pollJob(
        await lightdashApi<AiIdentityJob>({
            method: 'POST',
            url: `${baseUrl}/bulk-test`,
            body: JSON.stringify({ filter }),
        }),
    );
};

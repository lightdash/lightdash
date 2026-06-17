import { subject } from '@casl/ability';
import {
    type GsheetColumn as GsheetExportColumn,
    type GsheetColumnType as GsheetExportColumnType,
    type GsheetRow as GsheetExportRow,
} from '@lightdash/common';

export type { GsheetExportColumn, GsheetExportColumnType, GsheetExportRow };

type HealthShape = {
    auth: {
        google: {
            oauth2ClientId?: string;
            googleDriveApiKey?: string;
        };
    };
    siteUrl: string;
};

export type HandleGsheetExportRequest = {
    title: string;
    columns: GsheetExportColumn[];
    rows: GsheetExportRow[];
};

// Minimal structural type — only the `can` method is needed here.
// Using a structural interface keeps the dependency on the CASL Ability class
// out of the type and makes the function easy to test with a plain mock.
type CanCheck = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    can: (action: string, subject: any) => boolean;
};

export type HandleGsheetExportDeps = {
    capability: boolean;
    health: HealthShape;
    ability: CanCheck;
    projectUuid: string;
    organizationUuid: string;
    getAccessToken: () => Promise<unknown>;
    triggerLogin: (path: 'gdrive', siteUrl: string) => Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lightdashApi: (args: {
        url: string;
        method: 'GET' | 'POST';
        body?: string;
    }) => Promise<any>;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
};

type JobStatusResponse = {
    status: 'pending' | 'started' | 'completed' | 'error';
    // The `/csv/{jobId}` endpoint returns the resulting file URL as `url`,
    // not `fileUrl`. We map it back to `fileUrl` in our public return shape
    // to keep the SDK promise contract stable.
    url?: string;
    error?: string;
};

export async function handleGsheetExport(
    request: HandleGsheetExportRequest,
    deps: HandleGsheetExportDeps,
): Promise<{ fileUrl: string }> {
    if (!deps.capability) {
        throw new Error(
            'Google Sheets export is not available in this context',
        );
    }
    if (
        !deps.health.auth.google.oauth2ClientId ||
        !deps.health.auth.google.googleDriveApiKey
    ) {
        throw new Error(
            'Google Sheets is not configured for this Lightdash instance',
        );
    }
    if (
        !deps.ability.can(
            'manage',
            subject('GoogleSheets', {
                organizationUuid: deps.organizationUuid,
                projectUuid: deps.projectUuid,
            }),
        )
    ) {
        throw new Error('Forbidden: missing GoogleSheets permission');
    }

    try {
        await deps.getAccessToken();
    } catch {
        try {
            await deps.triggerLogin('gdrive', deps.health.siteUrl);
        } catch {
            throw new Error('Google authentication was cancelled');
        }
        await deps.getAccessToken();
    }

    const { jobId } = (await deps.lightdashApi({
        url: '/gdrive/upload-gsheet-from-rows',
        method: 'POST',
        body: JSON.stringify({
            projectUuid: deps.projectUuid,
            title: request.title,
            columns: request.columns,
            rows: request.rows,
        }),
    })) as { jobId: string };

    const intervalMs = deps.pollIntervalMs ?? 2000;
    // Match the iframe SDK's 120s timeout — once the SDK gives up, the parent
    // has nothing to deliver to and shouldn't keep polling. Without a deadline
    // a stuck job (worker dead, DB hiccup) would leak timers forever.
    const timeoutMs = deps.pollTimeoutMs ?? 120_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        const status = (await deps.lightdashApi({
            url: `/csv/${jobId}`,
            method: 'GET',
        })) as JobStatusResponse;
        if (status.status === 'completed') {
            if (!status.url) {
                throw new Error(
                    'Export job completed but returned no Google Sheets URL',
                );
            }
            return { fileUrl: status.url };
        }
        if (status.status === 'error') {
            throw new Error(status.error ?? 'Export job failed');
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error('Export job timed out');
}

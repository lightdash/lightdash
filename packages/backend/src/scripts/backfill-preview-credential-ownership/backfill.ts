import {
    normalizeWarehouseCredentials,
    ProjectType,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    getBigquerySsoCredentials,
    getPreviewOwnsBigquerySsoCredentials,
} from '../../services/ProjectService/previewBigquerySsoCredentials';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

export type BackfillOptions = {
    execute: boolean;
    batchSize: number;
};

export type BackfillContext = {
    database: Knex;
    encryptionUtil: Pick<EncryptionUtil, 'decrypt'>;
};

export type BackfillReport = {
    mode: 'dry-run' | 'execute';
    scanned: number;
    copies: number;
    owned: number;
    notBigquerySso: number;
    unreadable: number;
    updated: number;
    concurrentSkips: number;
};

type PreviewCredentialRow = {
    project_id: number;
    encrypted_credentials: Buffer;
    upstream_encrypted_credentials: Buffer | null;
    upstream_organization_warehouse_credentials_uuid: string | null;
};

const decryptCredentials = (
    encryptionUtil: BackfillContext['encryptionUtil'],
    encrypted: Buffer | null,
): CreateWarehouseCredentials | null => {
    if (!encrypted) return null;
    try {
        return normalizeWarehouseCredentials(
            JSON.parse(
                encryptionUtil.decrypt(encrypted),
            ) as CreateWarehouseCredentials,
        );
    } catch {
        return null;
    }
};

export const classifyPreviewOwnership = ({
    previewCredentials,
    upstreamCredentials,
}: {
    previewCredentials: CreateWarehouseCredentials;
    upstreamCredentials: CreateWarehouseCredentials | null;
}): boolean | null => {
    if (!getBigquerySsoCredentials(previewCredentials)) return null;
    if (!upstreamCredentials) return true;
    return (
        getPreviewOwnsBigquerySsoCredentials({
            previewCredentials,
            upstreamCredentials,
        }) ?? true
    );
};

const getUnclassifiedPreviews = (
    database: Knex,
    afterProjectId: number,
    batchSize: number,
): Promise<PreviewCredentialRow[]> =>
    database('warehouse_credentials as preview_credentials')
        .innerJoin(
            'projects as preview',
            'preview.project_id',
            'preview_credentials.project_id',
        )
        .leftJoin(
            'projects as upstream',
            'upstream.project_uuid',
            'preview.copied_from_project_uuid',
        )
        .leftJoin(
            'warehouse_credentials as upstream_credentials',
            'upstream_credentials.project_id',
            'upstream.project_id',
        )
        .where('preview.project_type', ProjectType.PREVIEW)
        .whereNull('preview.organization_warehouse_credentials_uuid')
        .where('preview_credentials.warehouse_type', 'bigquery')
        .whereNull('preview_credentials.preview_owns_credentials')
        .where('preview_credentials.project_id', '>', afterProjectId)
        .orderBy('preview_credentials.project_id')
        .limit(batchSize)
        .select<PreviewCredentialRow[]>([
            'preview_credentials.project_id',
            'preview_credentials.encrypted_credentials',
            'upstream_credentials.encrypted_credentials as upstream_encrypted_credentials',
            'upstream.organization_warehouse_credentials_uuid as upstream_organization_warehouse_credentials_uuid',
        ]);

export async function backfillPreviewCredentialOwnership(
    { database, encryptionUtil }: BackfillContext,
    { execute, batchSize }: BackfillOptions,
): Promise<BackfillReport> {
    const report: BackfillReport = {
        mode: execute ? 'execute' : 'dry-run',
        scanned: 0,
        copies: 0,
        owned: 0,
        notBigquerySso: 0,
        unreadable: 0,
        updated: 0,
        concurrentSkips: 0,
    };

    const classifyRow = async (row: PreviewCredentialRow): Promise<void> => {
        report.scanned += 1;
        const previewCredentials = decryptCredentials(
            encryptionUtil,
            row.encrypted_credentials,
        );
        if (!previewCredentials) {
            report.unreadable += 1;
            return;
        }
        const owns = classifyPreviewOwnership({
            previewCredentials,
            upstreamCredentials:
                row.upstream_organization_warehouse_credentials_uuid
                    ? null
                    : decryptCredentials(
                          encryptionUtil,
                          row.upstream_encrypted_credentials,
                      ),
        });
        if (owns === null) {
            report.notBigquerySso += 1;
            return;
        }
        if (owns) report.owned += 1;
        else report.copies += 1;
        if (!execute) return;

        const updatedRows = await database('warehouse_credentials')
            .update({ preview_owns_credentials: owns })
            .where('project_id', row.project_id)
            .whereNull('preview_owns_credentials')
            .where('encrypted_credentials', row.encrypted_credentials);
        if (updatedRows === 1) report.updated += 1;
        else report.concurrentSkips += 1;
    };

    const processBatches = async (afterProjectId: number): Promise<void> => {
        const rows = await getUnclassifiedPreviews(
            database,
            afterProjectId,
            batchSize,
        );
        await rows.reduce<Promise<void>>(async (previous, row) => {
            await previous;
            await classifyRow(row);
        }, Promise.resolve());
        if (rows.length === batchSize) {
            await processBatches(rows[rows.length - 1].project_id);
        }
    };

    await processBatches(0);
    return report;
}

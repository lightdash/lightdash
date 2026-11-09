import { type MobileAppPlatform } from '@lightdash/common';
import { createHash, randomBytes } from 'crypto';
import { Knex } from 'knex';
import {
    MobileAppLinkRateCountersTableName,
    MobileAppLinksTableName,
    type DbMobileAppLink,
} from '../database/entities/mobileAppLinks';

const SCAN_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const MOBILE_APP_LINK_TTL_MINUTES = 30;

export const hashMobileAppLinkKey = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

export const isWellFormedScanId = (scanId: string): boolean =>
    SCAN_ID_PATTERN.test(scanId);

export type RecordedMobileAppScan = {
    linkUuid: string;
    userUuid: string;
    organizationUuid: string;
    createdAt: Date;
    isFirstScan: boolean;
};

export class MobileAppLinkModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(
        userUuid: string,
        organizationUuid: string,
    ): Promise<{ linkUuid: string; scanId: string; expiresAt: Date }> {
        const scanId = randomBytes(32).toString('base64url');
        const [row] = await this.database(MobileAppLinksTableName)
            .insert({
                scan_id_hash: hashMobileAppLinkKey(scanId),
                user_uuid: userUuid,
                organization_uuid: organizationUuid,
                expires_at: this.database.raw(
                    `NOW() + INTERVAL '${MOBILE_APP_LINK_TTL_MINUTES} minutes'`,
                ),
            })
            .returning(['mobile_app_link_uuid', 'expires_at']);
        return {
            linkUuid: row.mobile_app_link_uuid,
            scanId,
            expiresAt: row.expires_at,
        };
    }

    async findForUser(
        linkUuid: string,
        userUuid: string,
    ): Promise<DbMobileAppLink | null> {
        const row = await this.database(MobileAppLinksTableName)
            .where({ mobile_app_link_uuid: linkUuid, user_uuid: userUuid })
            .first();
        return row ?? null;
    }

    async hasActiveLink(scanId: string): Promise<boolean> {
        if (!isWellFormedScanId(scanId)) return false;
        const row = await this.database(MobileAppLinksTableName)
            .select('mobile_app_link_uuid')
            .where('scan_id_hash', hashMobileAppLinkKey(scanId))
            .where('expires_at', '>', this.database.fn.now())
            .first();
        return row !== undefined;
    }

    async recordScan(
        scanId: string,
        platform: MobileAppPlatform,
    ): Promise<RecordedMobileAppScan | null> {
        if (!isWellFormedScanId(scanId)) return null;
        const [row] = await this.database(MobileAppLinksTableName)
            .where('scan_id_hash', hashMobileAppLinkKey(scanId))
            .where('expires_at', '>', this.database.fn.now())
            .update({
                first_scanned_at: this.database.raw(
                    'COALESCE(first_scanned_at, NOW())',
                ),
                first_scan_platform: this.database.raw(
                    'COALESCE(first_scan_platform, ?)',
                    [platform],
                ),
                scan_count: this.database.raw('scan_count + 1'),
            })
            .returning([
                'mobile_app_link_uuid',
                'user_uuid',
                'organization_uuid',
                'created_at',
                'scan_count',
            ]);
        if (!row) return null;
        return {
            linkUuid: row.mobile_app_link_uuid,
            userUuid: row.user_uuid,
            organizationUuid: row.organization_uuid,
            createdAt: row.created_at,
            isFirstScan: row.scan_count === 1,
        };
    }

    async incrementRateCounter(args: {
        keyHash: string;
        operation: string;
        windowStartedAt: Date;
    }): Promise<number> {
        const [row] = await this.database(MobileAppLinkRateCountersTableName)
            .insert({
                key_hash: args.keyHash,
                operation: args.operation,
                window_started_at: args.windowStartedAt,
                request_count: 1,
            })
            .onConflict(['key_hash', 'operation', 'window_started_at'])
            .merge({
                request_count: this.database.raw(
                    `${MobileAppLinkRateCountersTableName}.request_count + 1`,
                ),
            })
            .returning('request_count');
        return row.request_count;
    }

    async deleteExpired(): Promise<{ links: number; rateCounters: number }> {
        const links = await this.database(MobileAppLinksTableName)
            .where(
                'expires_at',
                '<',
                this.database.raw("NOW() - INTERVAL '1 hour'"),
            )
            .delete();
        const rateCounters = await this.database(
            MobileAppLinkRateCountersTableName,
        )
            .where(
                'window_started_at',
                '<',
                this.database.raw("NOW() - INTERVAL '2 hours'"),
            )
            .delete();
        return { links, rateCounters };
    }
}

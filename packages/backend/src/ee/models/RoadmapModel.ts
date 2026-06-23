import { RoadmapItemStatus } from '@lightdash/common';
import { Knex } from 'knex';
import {
    RoadmapCustomerLinksTableName,
    RoadmapItemsTableName,
} from '../database/entities/roadmap';

export type RoadmapCustomerLink = {
    organizationUuid: string;
    linearCustomerId: string;
    linearCustomerName: string;
    syncedAt: Date;
};

/** A curated item ready to be persisted to the mirror. */
export type CuratedRoadmapItem = {
    linearIssueId: string;
    title: string;
    description: string | null;
    status: RoadmapItemStatus;
};

/** A stored item read back for serving (curated fields only). */
export type StoredRoadmapItem = {
    title: string;
    description: string | null;
    status: RoadmapItemStatus;
};

type Dependencies = {
    database: Knex;
};

export class RoadmapModel {
    private readonly database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    /**
     * Replace the curated mirror for a single org -> Linear customer link.
     * Upserts the link and atomically swaps its items so a sync run leaves the
     * store in a consistent state.
     */
    async replaceCustomerMirror(params: {
        organizationUuid: string;
        linearCustomerId: string;
        linearCustomerName: string;
        items: CuratedRoadmapItem[];
    }): Promise<void> {
        const {
            organizationUuid,
            linearCustomerId,
            linearCustomerName,
            items,
        } = params;
        await this.database.transaction(async (trx) => {
            const [link] = await trx(RoadmapCustomerLinksTableName)
                .insert({
                    organization_uuid: organizationUuid,
                    linear_customer_id: linearCustomerId,
                    linear_customer_name: linearCustomerName,
                })
                .onConflict('organization_uuid')
                .merge({
                    linear_customer_id: linearCustomerId,
                    linear_customer_name: linearCustomerName,
                    synced_at: trx.fn.now(),
                })
                .returning('roadmap_customer_link_uuid');

            const linkUuid = link.roadmap_customer_link_uuid;

            await trx(RoadmapItemsTableName)
                .where('roadmap_customer_link_uuid', linkUuid)
                .delete();

            if (items.length > 0) {
                await trx(RoadmapItemsTableName).insert(
                    items.map((item, index) => ({
                        roadmap_customer_link_uuid: linkUuid,
                        linear_issue_id: item.linearIssueId,
                        title: item.title,
                        description: item.description,
                        status: item.status,
                        position: index,
                    })),
                );
            }
        });
    }

    async findCustomerLinkForOrg(
        organizationUuid: string,
    ): Promise<RoadmapCustomerLink | null> {
        const row = await this.database(RoadmapCustomerLinksTableName)
            .where('organization_uuid', organizationUuid)
            .first();
        if (!row) {
            return null;
        }
        return {
            organizationUuid: row.organization_uuid,
            linearCustomerId: row.linear_customer_id,
            linearCustomerName: row.linear_customer_name,
            syncedAt: row.synced_at,
        };
    }

    async getRoadmapItemsForOrg(
        organizationUuid: string,
    ): Promise<StoredRoadmapItem[]> {
        const rows = await this.database(RoadmapItemsTableName)
            .innerJoin(
                RoadmapCustomerLinksTableName,
                `${RoadmapItemsTableName}.roadmap_customer_link_uuid`,
                `${RoadmapCustomerLinksTableName}.roadmap_customer_link_uuid`,
            )
            .where(
                `${RoadmapCustomerLinksTableName}.organization_uuid`,
                organizationUuid,
            )
            .orderBy(`${RoadmapItemsTableName}.position`, 'asc')
            .select(
                `${RoadmapItemsTableName}.title`,
                `${RoadmapItemsTableName}.description`,
                `${RoadmapItemsTableName}.status`,
            );
        return rows.map((row) => ({
            title: row.title,
            description: row.description,
            status: row.status,
        }));
    }
}

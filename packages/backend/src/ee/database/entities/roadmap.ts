import { RoadmapItemStatus } from '@lightdash/common';
import { Knex } from 'knex';

/**
 * Curated mirror of Linear feature requests served by the central roadmap
 * service. `roadmap_customer_links` records which Lightdash organization an
 * org resolves to in Linear (one row per org); `roadmap_items` holds the
 * curated, customer-safe items for that link.
 */

export const RoadmapCustomerLinksTableName = 'roadmap_customer_links';
export const RoadmapItemsTableName = 'roadmap_items';

type DbRoadmapCustomerLink = {
    roadmap_customer_link_uuid: string;
    organization_uuid: string;
    linear_customer_id: string;
    linear_customer_name: string;
    synced_at: Date;
};

type DbRoadmapCustomerLinkInsert = Omit<
    DbRoadmapCustomerLink,
    'roadmap_customer_link_uuid' | 'synced_at'
>;

type DbRoadmapCustomerLinkUpdate = Pick<
    DbRoadmapCustomerLink,
    'linear_customer_id' | 'linear_customer_name' | 'synced_at'
>;

export type RoadmapCustomerLinksTable = Knex.CompositeTableType<
    DbRoadmapCustomerLink,
    DbRoadmapCustomerLinkInsert,
    DbRoadmapCustomerLinkUpdate
>;

type DbRoadmapItem = {
    roadmap_item_uuid: string;
    roadmap_customer_link_uuid: string;
    linear_issue_id: string;
    title: string;
    description: string | null;
    status: RoadmapItemStatus;
    position: number;
    synced_at: Date;
};

type DbRoadmapItemInsert = Omit<
    DbRoadmapItem,
    'roadmap_item_uuid' | 'synced_at'
>;

export type RoadmapItemsTable = Knex.CompositeTableType<
    DbRoadmapItem,
    DbRoadmapItemInsert
>;

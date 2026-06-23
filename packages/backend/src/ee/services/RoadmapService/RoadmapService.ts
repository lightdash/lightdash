import {
    buildRoadmapItem,
    getErrorMessage,
    redactRoadmapItems,
    RoadmapItem,
} from '@lightdash/common';
import type { LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { LinearClient } from '../../clients/Linear/LinearClient';
import { CuratedRoadmapItem, RoadmapModel } from '../../models/RoadmapModel';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    roadmapModel: RoadmapModel;
    linearClient: LinearClient | null;
};

export type RoadmapSyncSummary = {
    customers: number;
    skippedCustomers: number;
    syncedItems: number;
    rejectedItems: number;
};

/**
 * Central roadmap service. Mirrors Linear feature requests into a curated,
 * customer-safe store on a schedule, and serves read-only per-org roadmap
 * responses from that store. The Linear API is only ever touched by the sync
 * path; serving reads exclusively from the mirror.
 */
export class RoadmapService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly roadmapModel: RoadmapModel;

    private readonly linearClient: LinearClient | null;

    constructor(dependencies: Dependencies) {
        super({ serviceName: 'RoadmapService' });
        this.lightdashConfig = dependencies.lightdashConfig;
        this.roadmapModel = dependencies.roadmapModel;
        this.linearClient = dependencies.linearClient;
    }

    private isSyncEnabled(): boolean {
        return (
            this.lightdashConfig.roadmap.enabled && this.linearClient !== null
        );
    }

    /**
     * Resolve a Linear customer's external ids to the single Lightdash
     * organization it maps to. A customer with no (or multiple) org-shaped
     * external ids can't be resolved unambiguously and is skipped.
     */
    private static resolveOrganizationUuid(
        externalIds: string[],
    ): string | null {
        return externalIds.length === 1 ? externalIds[0] : null;
    }

    /**
     * Scheduled job entry point. Pulls every Linear customer, resolves it to a
     * Lightdash org, curates its feature requests and replaces that org's
     * mirror. Per-customer failures are logged and skipped so one bad customer
     * can't fail the whole run.
     */
    async syncMirror(): Promise<RoadmapSyncSummary> {
        const summary: RoadmapSyncSummary = {
            customers: 0,
            skippedCustomers: 0,
            syncedItems: 0,
            rejectedItems: 0,
        };

        if (!this.isSyncEnabled() || this.linearClient === null) {
            this.logger.info(
                'Roadmap sync skipped: feature disabled or Linear API key missing',
            );
            return summary;
        }

        const customers = await this.linearClient.listCustomers();
        summary.customers = customers.length;

        for (const customer of customers) {
            const organizationUuid = RoadmapService.resolveOrganizationUuid(
                customer.externalIds,
            );
            if (organizationUuid === null) {
                summary.skippedCustomers += 1;
                this.logger.warn(
                    `Roadmap sync: Linear customer ${customer.id} has no resolvable organization, skipping`,
                );
                // eslint-disable-next-line no-continue
                continue;
            }

            try {
                // Customers are synced sequentially to avoid hammering the
                // Linear API.
                // eslint-disable-next-line no-await-in-loop
                const result = await this.syncCustomer(
                    customer,
                    organizationUuid,
                );
                summary.syncedItems += result.syncedItems;
                summary.rejectedItems += result.rejectedItems;
            } catch (error) {
                summary.skippedCustomers += 1;
                this.logger.error(
                    `Roadmap sync: failed to sync Linear customer ${customer.id}: ${getErrorMessage(error)}`,
                );
            }
        }

        this.logger.info('Roadmap mirror sync complete', { ...summary });
        return summary;
    }

    /**
     * Fetch, curate and store the feature requests for one already-resolved
     * customer. Issues whose status can't be mapped are excluded (counted in
     * `rejectedItems`) rather than served with a wrong status.
     */
    private async syncCustomer(
        customer: { id: string; name: string },
        organizationUuid: string,
    ): Promise<{ syncedItems: number; rejectedItems: number }> {
        if (this.linearClient === null) {
            return { syncedItems: 0, rejectedItems: 0 };
        }

        const issues = await this.linearClient.getCustomerFeatureRequests(
            customer.id,
        );

        const items: CuratedRoadmapItem[] = [];
        let rejectedItems = 0;
        issues.forEach((issue) => {
            try {
                const built = buildRoadmapItem({
                    title: issue.title,
                    description: issue.description,
                    state: issue.state,
                });
                items.push({
                    linearIssueId: issue.id,
                    title: built.title,
                    description: built.description,
                    status: built.status,
                });
            } catch (error) {
                // Unmappable status — exclude rather than mislabel.
                rejectedItems += 1;
                this.logger.warn(
                    `Roadmap sync: skipping Linear issue ${issue.id} for customer ${customer.id}: ${getErrorMessage(error)}`,
                );
            }
        });

        await this.roadmapModel.replaceCustomerMirror({
            organizationUuid,
            linearCustomerId: customer.id,
            linearCustomerName: customer.name,
            items,
        });

        return { syncedItems: items.length, rejectedItems };
    }

    /**
     * Serve the curated roadmap for an organization from the mirror. Returns an
     * empty list when the org has no mapped customer or no items. Runs the
     * stored items through the redaction checkpoint as a final defensive
     * boundary before they leave the service.
     */
    async getRoadmapForOrg(params: {
        organizationUuid: string;
    }): Promise<RoadmapItem[]> {
        const { organizationUuid } = params;
        const link =
            await this.roadmapModel.findCustomerLinkForOrg(organizationUuid);
        if (link === null) {
            return [];
        }

        const stored =
            await this.roadmapModel.getRoadmapItemsForOrg(organizationUuid);
        const { items, rejected } = redactRoadmapItems(stored);
        if (rejected.length > 0) {
            // Reaching here means curation upstream is broken — the stored
            // mirror should already be safe. Alarm internally; never surface.
            this.logger.error(
                `Roadmap redaction rejected ${rejected.length} stored item(s) for organization ${organizationUuid}`,
            );
        }
        return items;
    }
}

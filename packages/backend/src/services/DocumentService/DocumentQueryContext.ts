import {
    buildMergeQueryFromSaved,
    ForbiddenError,
    isDocumentExploreChart,
    NotFoundError,
    ParameterError,
    type Account,
    type DocumentExploreChartContent,
    type DocumentQueryReference,
    type MergeQuery,
    type MetricQuery,
    type ParametersValuesMap,
    type RegisteredAccount,
} from '@lightdash/common';
import { isEqual } from 'lodash';
import { normalizeFilterIds } from '../CoderService/filterIds';
import type { DocumentService } from './DocumentService';

const comparable = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value));

/** Server-only proof that execution is bound to an authorized persisted chart. */
export class DocumentQueryContext {
    private constructor(
        private readonly accountUserUuid: string,
        readonly projectUuid: string,
        readonly reference: DocumentQueryReference,
        readonly content: DocumentExploreChartContent,
        readonly metricQuery: MetricQuery,
        readonly mergeQuery: MergeQuery | undefined,
        private readonly sourceRowCap: number,
    ) {}

    /** Loads an Explore chart through Document authorization. */
    static async authorize({
        documentService,
        account,
        projectUuid,
        reference,
        sourceRowCap,
    }: {
        documentService: DocumentService;
        account: RegisteredAccount;
        projectUuid: string;
        reference: DocumentQueryReference;
        sourceRowCap: number;
    }): Promise<DocumentQueryContext> {
        const content = await documentService.getChart(
            account,
            projectUuid,
            reference,
        );
        if (!isDocumentExploreChart(content)) {
            throw new ParameterError(
                `Document chart "${reference.chartId}" does not query an Explore`,
            );
        }
        return DocumentQueryContext.fromChart({
            account,
            projectUuid,
            reference,
            content,
            sourceRowCap,
        });
    }

    /** Binds execution to an Explore chart already loaded through Document authorization. */
    static fromChart({
        account,
        projectUuid,
        reference,
        content,
        sourceRowCap,
    }: {
        account: RegisteredAccount;
        projectUuid: string;
        reference: DocumentQueryReference;
        content: DocumentExploreChartContent;
        sourceRowCap: number;
    }): DocumentQueryContext {
        const metricQuery = {
            ...content.chart.metricQuery,
            filters: normalizeFilterIds(content.chart.metricQuery.filters),
        };
        return new DocumentQueryContext(
            account.user.userUuid,
            projectUuid,
            reference,
            content,
            metricQuery,
            content.source === 'merge'
                ? buildMergeQueryFromSaved(metricQuery, content.chart.merge)
                : undefined,
            sourceRowCap,
        );
    }

    private assertIdentity(
        account: Account,
        projectUuid: string,
        parameters?: ParametersValuesMap,
    ): void {
        if (
            account.user.id !== this.accountUserUuid ||
            projectUuid !== this.projectUuid ||
            !isEqual(parameters ?? {}, this.content.chart.parameters ?? {})
        ) {
            throw new ForbiddenError(
                'Document query context does not match this execution',
            );
        }
    }

    assertMetricQuery(
        account: Account,
        projectUuid: string,
        query: MetricQuery,
        parameters?: ParametersValuesMap,
    ): void {
        this.assertIdentity(account, projectUuid, parameters);
        const candidates = this.mergeQuery
            ? this.mergeQuery.sources.flatMap((source) =>
                  'metricQuery' in source
                      ? [
                            {
                                ...source.metricQuery,
                                sorts: [],
                                limit: this.sourceRowCap,
                            },
                        ]
                      : [],
              )
            : [this.metricQuery];
        if (
            !candidates.some((candidate) =>
                isEqual(comparable(candidate), comparable(query)),
            )
        ) {
            throw new ForbiddenError(
                'Only the persisted Document query can execute',
            );
        }
    }

    assertMergeQuery(
        account: Account,
        projectUuid: string,
        query: MergeQuery,
        parameters?: ParametersValuesMap,
    ): void {
        this.assertIdentity(account, projectUuid, parameters);
        if (
            !this.mergeQuery ||
            !isEqual(comparable(this.mergeQuery), comparable(query))
        ) {
            throw new ForbiddenError(
                'Only the persisted Document merge can execute',
            );
        }
    }
}

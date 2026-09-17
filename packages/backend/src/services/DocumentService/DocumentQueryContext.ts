import {
    buildMergeQueryFromSaved,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type Account,
    type DocumentCell,
    type DocumentQueryReference,
    type MergeQuery,
    type MetricQuery,
    type ParametersValuesMap,
    type RegisteredAccount,
} from '@lightdash/common';
import { isEqual } from 'lodash';
import { normalizeFilterIds } from '../CoderService/filterIds';
import type { DocumentService } from './DocumentService';

type ChartCell = Extract<DocumentCell, { type: 'chart' }>;

const comparable = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value));

/** Server-only proof that execution is bound to an authorized persisted cell. */
export class DocumentQueryContext {
    private constructor(
        private readonly accountUserUuid: string,
        readonly projectUuid: string,
        readonly reference: DocumentQueryReference,
        readonly content: ChartCell['content'],
        readonly metricQuery: MetricQuery,
        readonly mergeQuery: MergeQuery | undefined,
        private readonly sourceRowCap: number,
    ) {}

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
        const document = await documentService.get(
            account,
            projectUuid,
            reference.documentUuid,
        );
        if (document.version.versionUuid !== reference.versionUuid) {
            throw new ConflictError(
                'Document has changed. Reload it before running its charts.',
            );
        }
        if (
            !Number.isSafeInteger(reference.cellIndex) ||
            reference.cellIndex < 0
        ) {
            throw new ParameterError(
                'Document cell index must be a non-negative integer',
            );
        }
        const cell = document.version.content.cells[reference.cellIndex];
        if (!cell || cell.type !== 'chart') {
            throw new NotFoundError('Document chart cell not found');
        }
        const metricQuery = {
            ...cell.content.chart.metricQuery,
            filters: normalizeFilterIds(cell.content.chart.metricQuery.filters),
        };
        return new DocumentQueryContext(
            account.user.userUuid,
            projectUuid,
            reference,
            cell.content,
            metricQuery,
            cell.content.source === 'merge'
                ? buildMergeQueryFromSaved(
                      metricQuery,
                      cell.content.chart.merge,
                  )
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

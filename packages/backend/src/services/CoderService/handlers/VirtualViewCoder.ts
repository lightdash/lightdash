import { subject } from '@casl/ability';
import {
    Account,
    AlreadyExistsError,
    ApiVirtualViewAsCodeListResponse,
    ApiVirtualViewAsCodeUpsertResponse,
    ContentAsCodeType,
    currentVersion,
    DimensionType,
    Explore,
    ExploreType,
    ForbiddenError,
    getParameterReferences,
    isExploreError,
    ParameterError,
    PromotionAction,
    SessionUser,
    snakeCaseName,
    VirtualViewAsCode,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../BaseService';
import { ProjectService } from '../../ProjectService/ProjectService';

type VirtualViewCoderArguments = {
    projectModel: ProjectModel;
    projectService?: ProjectService;
};

export class VirtualViewCoder extends BaseService {
    private readonly projectModel: ProjectModel;

    private readonly projectService?: ProjectService;

    constructor({ projectModel, projectService }: VirtualViewCoderArguments) {
        super();
        this.projectModel = projectModel;
        this.projectService = projectService;
    }

    private static transform(virtualView: Explore): VirtualViewAsCode | null {
        const table = virtualView.tables[virtualView.baseTable];
        const dimensions = table ? Object.values(table.dimensions) : [];
        const dimensionNames = dimensions.map(({ name }) => name);
        if (
            !virtualView.name?.trim() ||
            !virtualView.label?.trim() ||
            !table?.sqlTable ||
            table.name !== virtualView.name ||
            virtualView.baseTable !== virtualView.name ||
            !table.sqlTable.startsWith('(') ||
            !table.sqlTable.endsWith(')') ||
            dimensionNames.some((name) => !name?.trim()) ||
            new Set(dimensionNames).size !== dimensionNames.length ||
            dimensions.some(
                ({ type }) => !Object.values(DimensionType).includes(type),
            )
        ) {
            return null;
        }

        return {
            contentType: ContentAsCodeType.VIRTUAL_VIEW,
            version: currentVersion,
            slug: virtualView.name,
            name: virtualView.label,
            sql: table.sqlTable.slice(1, -1),
            columns: dimensions
                .map(({ name, type }) => ({ reference: name, type }))
                .sort((left, right) =>
                    left.reference.localeCompare(right.reference),
                ),
            parameters: virtualView.savedParameterValues ?? null,
        };
    }

    async list(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
    ): Promise<ApiVirtualViewAsCodeListResponse['results']> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download virtual views',
            );
        }

        const requested = slugs ? new Set(slugs) : null;
        const cached =
            await this.projectModel.findVirtualViewsFromCache(projectUuid);
        const virtualViews: VirtualViewAsCode[] = [];
        const skipped: ApiVirtualViewAsCodeListResponse['results']['skipped'] =
            [];
        Object.values(cached)
            .sort((left, right) => left.name.localeCompare(right.name))
            .forEach((explore) => {
                if (requested && !requested.has(explore.name)) return;
                if (
                    isExploreError(explore) ||
                    explore.type !== ExploreType.VIRTUAL
                ) {
                    skipped.push({
                        slug: explore.name,
                        reason: 'Cached virtual view is malformed',
                    });
                    return;
                }
                const transformed = VirtualViewCoder.transform(explore);
                if (transformed) virtualViews.push(transformed);
                else {
                    skipped.push({
                        slug: explore.name,
                        reason: 'Virtual view SQL is not stored as a subquery',
                    });
                }
            });

        const found = new Set([
            ...virtualViews.map(({ slug }) => slug),
            ...skipped.map(({ slug }) => slug),
        ]);
        return {
            virtualViews,
            skipped,
            missingSlugs: slugs?.filter((slug) => !found.has(slug)) ?? [],
        };
    }

    async upsert(
        account: Account,
        projectUuid: string,
        slug: string,
        virtualView: VirtualViewAsCode,
        force = false,
    ): Promise<ApiVirtualViewAsCodeUpsertResponse['results']> {
        if (virtualView.contentType !== ContentAsCodeType.VIRTUAL_VIEW) {
            throw new ParameterError('Invalid virtual view contentType');
        }
        if (virtualView.version !== currentVersion) {
            throw new ParameterError(
                `Unsupported virtual view version ${virtualView.version}`,
            );
        }
        if (slug !== virtualView.slug) {
            throw new ParameterError(
                'Virtual view path and body slugs must match',
            );
        }
        if (
            !slug.trim() ||
            !virtualView.name.trim() ||
            !virtualView.sql.trim()
        ) {
            throw new ParameterError(
                'Virtual view slug, name, and SQL are required',
            );
        }
        if (
            snakeCaseName(slug) !== slug ||
            slug.includes('/') ||
            slug.includes('\\') ||
            Array.from(slug).some((character) => character.charCodeAt(0) < 32)
        ) {
            throw new ParameterError(
                'Virtual view slug must be a canonical snake_case identifier',
            );
        }
        if (virtualView.columns.length === 0) {
            throw new ParameterError(
                'Virtual view must define at least one column',
            );
        }
        const references = virtualView.columns.map(
            ({ reference }) => reference,
        );
        if (
            references.some((reference) => !reference.trim()) ||
            new Set(references).size !== references.length
        ) {
            throw new ParameterError(
                'Virtual view column references must be non-empty and unique',
            );
        }
        const dimensionTypes = new Set(Object.values(DimensionType));
        if (virtualView.columns.some(({ type }) => !dimensionTypes.has(type))) {
            throw new ParameterError(
                'Virtual view columns must use valid types',
            );
        }
        const parameterReferences = new Set(
            getParameterReferences(virtualView.sql),
        );
        const unusedParameters = Object.keys(
            virtualView.parameters ?? {},
        ).filter((name) => !parameterReferences.has(name));
        if (unusedParameters.length > 0) {
            throw new ParameterError(
                `Virtual view contains values for unreferenced parameters: ${unusedParameters.join(', ')}`,
            );
        }

        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                    metadata: { slug },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!this.projectService) {
            throw new Error(
                'ProjectService is required to upload virtual views',
            );
        }
        await this.projectService.validateVirtualViewParameterReferences(
            projectUuid,
            virtualView.sql,
            virtualView.parameters ?? undefined,
        );

        const existingByName = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            [slug],
        );
        const existing = existingByName[slug];
        if (
            existing &&
            (isExploreError(existing) || existing.type !== ExploreType.VIRTUAL)
        ) {
            throw new AlreadyExistsError(
                `An explore named "${slug}" already exists and cannot be adopted`,
            );
        }
        const normalized = {
            ...virtualView,
            columns: [...virtualView.columns].sort((left, right) =>
                left.reference.localeCompare(right.reference),
            ),
        };
        if (existing && existing.type === ExploreType.VIRTUAL) {
            const current = VirtualViewCoder.transform(existing);
            if (!current && !force) {
                throw new ParameterError(
                    'Malformed existing virtual view requires force to replace',
                );
            }
            if (current && isEqual(current, normalized)) {
                return { action: PromotionAction.NO_CHANGES };
            }
            if (current && !force) {
                const desiredColumns = new Map(
                    normalized.columns.map((column) => [
                        column.reference,
                        column.type,
                    ]),
                );
                const destructive = current.columns.filter(
                    (column) =>
                        desiredColumns.get(column.reference) !== column.type,
                );
                if (destructive.length > 0) {
                    throw new ParameterError(
                        `Destructive virtual view column changes require force: ${destructive.map(({ reference }) => reference).join(', ')}`,
                    );
                }
            }
            await this.projectService.updateVirtualView(
                account,
                projectUuid,
                slug,
                {
                    name: normalized.name,
                    sql: normalized.sql,
                    columns: normalized.columns,
                    parameterValues: normalized.parameters ?? undefined,
                },
                false,
                existing,
            );
            return { action: PromotionAction.UPDATE };
        }

        await this.projectService.createVirtualView(
            account,
            projectUuid,
            {
                name: slug,
                label: normalized.name,
                sql: normalized.sql,
                columns: normalized.columns,
                parameterValues: normalized.parameters ?? undefined,
            },
            false,
        );
        return { action: PromotionAction.CREATE };
    }
}

import {
    NotFoundError,
    UnexpectedServerError,
    type QuerySourceType,
} from '@lightdash/common';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../ProjectService/ProjectService';
import { DuckdbQuerySource } from './sources/DuckdbQuerySource';
import { FunnelQuerySource } from './sources/FunnelQuerySource';
import { PythonQuerySource } from './sources/PythonQuerySource';
import { SemanticLayerQuerySource } from './sources/SemanticLayerQuerySource';
import { SqlQuerySource } from './sources/SqlQuerySource';
import type { QuerySourceClient } from './types';

/**
 * Registry of the query sources available to a deployment. Built-in sources
 * are registered at service construction; commercial or self-hosted
 * extensions register additional sources before the service is used.
 */
export class QuerySourceRegistry {
    private readonly sources: Map<QuerySourceType, QuerySourceClient> =
        new Map();

    /** Creates the built-in registry for extension by enterprise sources. */
    static withBuiltInSources({
        asyncQueryService,
        projectService,
        projectModel,
        funnelBuilderEnabled,
    }: {
        asyncQueryService: AsyncQueryService;
        projectService: ProjectService;
        projectModel: ProjectModel;
        /** lightdashConfig.funnelBuilder.enabled, the funnel builder's ENV gate. */
        funnelBuilderEnabled: boolean;
    }): QuerySourceRegistry {
        const registry = new QuerySourceRegistry();
        registry.register(
            new SemanticLayerQuerySource({
                asyncQueryService,
                projectService,
            }),
        );
        registry.register(
            new SqlQuerySource({
                asyncQueryService,
                projectService,
            }),
        );
        registry.register(new DuckdbQuerySource({ asyncQueryService }));
        registry.register(new PythonQuerySource({ asyncQueryService }));
        if (funnelBuilderEnabled) {
            registry.register(
                new FunnelQuerySource({
                    asyncQueryService,
                    projectService,
                    projectModel,
                }),
            );
        }
        return registry;
    }

    register(source: QuerySourceClient): void {
        const { sourceType } = source.definition;
        if (this.sources.has(sourceType)) {
            throw new UnexpectedServerError(
                `Query source "${sourceType}" is already registered`,
            );
        }
        this.sources.set(sourceType, source);
    }

    get(sourceType: QuerySourceType): QuerySourceClient {
        const source = this.sources.get(sourceType);
        if (!source) {
            throw new NotFoundError(`Unknown query source "${sourceType}"`);
        }
        return source;
    }

    list(): QuerySourceClient[] {
        return Array.from(this.sources.values());
    }
}

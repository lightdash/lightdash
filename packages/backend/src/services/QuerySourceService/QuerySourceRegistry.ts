import {
    NotFoundError,
    UnexpectedServerError,
    type QuerySourceDefinition,
    type QuerySourceType,
} from '@lightdash/common';
import type { QuerySourceClient } from './types';

/**
 * Registry of the query sources available to a deployment. Built-in sources
 * are registered at service construction; commercial or self-hosted
 * extensions register additional sources before the service is used.
 */
export class QuerySourceRegistry {
    private readonly sources: Map<QuerySourceType, QuerySourceClient> =
        new Map();

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

    list(): QuerySourceDefinition[] {
        return Array.from(this.sources.values()).map(
            (source) => source.definition,
        );
    }
}

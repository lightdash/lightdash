import { ConflictError, ParameterError } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    ProjectCatalogueGenerationsTableName,
    ProjectCompilePinsTableName,
    ProjectSourceGenerationsTableName,
    type CompileBinding,
    type CompilePin,
    type CompileSlice,
} from '../database/entities/projectCompilePins';
import Logger from '../logging/logger';

export type {
    CompileBinding,
    CompilePin,
    CompileSlice,
} from '../database/entities/projectCompilePins';

export const MAX_COMPILE_METADATA_BYTES = 32 * 1024 * 1024;
export const MAX_COMPILE_BINDINGS = 100_000;

export class ProjectCompileModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async capture(
        projectUuid: string,
        sources: { sourceUuid: string; sourceName: string }[],
    ): Promise<CompileSlice[]> {
        if (sources.length === 0) return [];
        const rows = await this.database(ProjectSourceGenerationsTableName)
            .where('project_uuid', projectUuid)
            .whereIn(
                'source_uuid',
                sources.map(({ sourceUuid }) => sourceUuid),
            );
        const generations = new Map(
            rows.map((row) => [row.source_uuid, Number(row.generation)]),
        );
        return sources.map((source) => ({
            ...source,
            generation: generations.get(source.sourceUuid) ?? 0,
        }));
    }

    async get(projectUuid: string, compileJobUuid: string) {
        return this.database(ProjectCompilePinsTableName)
            .where({
                project_uuid: projectUuid,
                compile_job_uuid: compileJobUuid,
            })
            .first();
    }

    async publish(
        trx: Knex.Transaction,
        {
            projectUuid,
            compileJobUuid,
            slices,
            pins,
            bindings,
        }: {
            projectUuid: string;
            compileJobUuid: string;
            slices: CompileSlice[];
            pins: CompilePin[];
            bindings: CompileBinding[];
        },
    ): Promise<number> {
        const serializedPins = JSON.stringify(pins);
        const serializedBindings = JSON.stringify(bindings);
        const metadataBytes =
            Buffer.byteLength(serializedPins, 'utf8') +
            Buffer.byteLength(serializedBindings, 'utf8');
        if (
            bindings.length > MAX_COMPILE_BINDINGS ||
            metadataBytes > MAX_COMPILE_METADATA_BYTES
        ) {
            throw new ParameterError(
                `Compile metadata exceeds the limit of ${MAX_COMPILE_BINDINGS} bindings or ${MAX_COMPILE_METADATA_BYTES} bytes. Nothing was changed.`,
            );
        }
        const sortedSlices = [...slices].sort((left, right) =>
            left.sourceUuid.localeCompare(right.sourceUuid),
        );
        await sortedSlices.reduce(async (previous, slice) => {
            await previous;
            await trx(ProjectSourceGenerationsTableName)
                .insert({
                    project_uuid: projectUuid,
                    source_uuid: slice.sourceUuid,
                    generation: 0,
                })
                .onConflict(['project_uuid', 'source_uuid'])
                .ignore();
            const changed = await trx(ProjectSourceGenerationsTableName)
                .where({
                    project_uuid: projectUuid,
                    source_uuid: slice.sourceUuid,
                    generation: String(slice.generation),
                })
                .increment('generation', 1);
            if (changed !== 1) {
                Logger.warn('compile.publish.conflict', {
                    event: 'compile.publish.conflict',
                    projectUuid,
                    compileJobUuid,
                    sourceUuid: slice.sourceUuid,
                    expectedGeneration: slice.generation,
                });
                throw new ConflictError(
                    `A newer deploy or refresh of source ${slice.sourceName} was published while this one ran, so nothing was changed. Run it again if you still need it.`,
                );
            }
        }, Promise.resolve());
        await trx(ProjectCatalogueGenerationsTableName)
            .insert({ project_uuid: projectUuid, generation: 0 })
            .onConflict('project_uuid')
            .ignore();
        const [published] = await trx(ProjectCatalogueGenerationsTableName)
            .where('project_uuid', projectUuid)
            .increment('generation', 1)
            .returning('generation');
        const generation = Number(published.generation);
        await trx(ProjectCompilePinsTableName).insert({
            project_uuid: projectUuid,
            compile_job_uuid: compileJobUuid,
            generation,
            pins: serializedPins,
            bindings: serializedBindings,
            metadata_bytes: metadataBytes,
        });
        return generation;
    }
}

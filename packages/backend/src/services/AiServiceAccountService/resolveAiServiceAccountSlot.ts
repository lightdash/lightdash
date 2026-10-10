import { NotFoundError, ProjectType } from '@lightdash/common';
import { type AiServiceAccountCredentialsModel } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';

export type AiServiceAccountSlotDependencies = {
    aiServiceAccountCredentialsModel: Pick<
        AiServiceAccountCredentialsModel,
        'getSecrets' | 'getSlot'
    >;
    projectModel: Pick<ProjectModel, 'getSummary'>;
    warehouseConnectionModel: Pick<
        WarehouseConnectionModel,
        'getProject' | 'get' | 'list'
    >;
};

type Input = { projectUuid: string; connection: string | null };
type Resolution<T> = {
    slot: T;
    sourceProjectUuid: string;
    sourceConnection: string | null;
    inherited: boolean;
};

export class AiServiceAccountSlotResolutionError extends Error {
    constructor(readonly inheritedFromProjectUuid: string | null) {
        super('The saved shared agent account credentials could not be read.');
    }
}

export class AiServiceAccountSlotResolver {
    constructor(private readonly deps: AiServiceAccountSlotDependencies) {}

    private async normalize(input: Input): Promise<Input> {
        if (input.connection === null) return input;
        const project = await this.deps.warehouseConnectionModel.getProject(
            input.projectUuid,
        );
        const connection = await this.deps.warehouseConnectionModel.get(
            project,
            input.connection,
        );
        return {
            ...input,
            connection: connection.isOriginal ? null : input.connection,
        };
    }

    private async parent(input: Input): Promise<Input | null> {
        const project = await this.deps.projectModel.getSummary(
            input.projectUuid,
        );
        const parentUuid = project.upstreamProjectUuid ?? null;
        if (
            project.type !== ProjectType.PREVIEW ||
            parentUuid === null ||
            parentUuid === input.projectUuid
        )
            return null;
        try {
            const parent = await this.deps.projectModel.getSummary(parentUuid);
            if (parent.organizationUuid !== project.organizationUuid)
                return null;
            if (input.connection === null)
                return { projectUuid: parentUuid, connection: null };
            const childConnection =
                await this.deps.warehouseConnectionModel.get(
                    await this.deps.warehouseConnectionModel.getProject(
                        input.projectUuid,
                    ),
                    input.connection,
                );
            const connections = await this.deps.warehouseConnectionModel.list(
                await this.deps.warehouseConnectionModel.getProject(parentUuid),
            );
            const matching = connections.find(
                (connection) =>
                    !connection.isOriginal &&
                    connection.name === childConnection.name &&
                    connection.warehouseType === childConnection.warehouseType,
            );
            return matching
                ? {
                      projectUuid: parentUuid,
                      connection: matching.warehouseConnectionUuid,
                  }
                : null;
        } catch (error) {
            if (error instanceof NotFoundError) return null;
            throw error;
        }
    }

    private async read<T>(
        input: Input,
        inherited: boolean,
        load: (input: Input) => Promise<T | null>,
    ): Promise<Resolution<T> | null> {
        let slot: T | null;
        try {
            slot = await load(input);
        } catch {
            throw new AiServiceAccountSlotResolutionError(
                inherited ? input.projectUuid : null,
            );
        }
        return slot === null
            ? null
            : {
                  slot,
                  sourceProjectUuid: input.projectUuid,
                  sourceConnection: input.connection,
                  inherited,
              };
    }

    private async resolveWith<T>(
        input: Input,
        load: (input: Input) => Promise<T | null>,
    ): Promise<Resolution<T> | null> {
        const normalized = await this.normalize(input);
        const own = await this.read(normalized, false, load);
        if (own !== null) return own;
        const parent = await this.parent(normalized);
        return parent === null ? null : this.read(parent, true, load);
    }

    async resolve(input: Input) {
        return this.resolveWith(input, ({ projectUuid, connection }) =>
            this.deps.aiServiceAccountCredentialsModel.getSecrets(
                projectUuid,
                connection,
                true,
            ),
        );
    }

    async resolveMetadata(input: Input) {
        return this.resolveWith(input, ({ projectUuid, connection }) =>
            this.deps.aiServiceAccountCredentialsModel.getSlot(
                projectUuid,
                connection,
            ),
        );
    }

    async resolveParent(input: Input) {
        const parent = await this.parent(await this.normalize(input));
        return parent === null
            ? null
            : this.read(parent, true, ({ projectUuid, connection }) =>
                  this.deps.aiServiceAccountCredentialsModel.getSecrets(
                      projectUuid,
                      connection,
                      true,
                  ),
              );
    }

    async resolveParentMetadata(input: Input) {
        const parent = await this.parent(await this.normalize(input));
        return parent === null
            ? null
            : this.read(parent, true, ({ projectUuid, connection }) =>
                  this.deps.aiServiceAccountCredentialsModel.getSlot(
                      projectUuid,
                      connection,
                  ),
              );
    }
}

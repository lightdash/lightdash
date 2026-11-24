import { subject } from '@casl/ability';
import {
    DbtProjectType,
    getErrorMessage,
    isExploreError,
    RequestMethod,
    type Explore,
    type ExploreError,
    type ExploreType,
    type Project,
    type SessionUser,
} from '@lightdash/common';
import { type ProjectCompileLogModel } from '../../../models/ProjectCompileLogModel';
import { CompileInterruptedError } from '../../../scheduler/compileShutdown';
import { BaseService } from '../../../services/BaseService';
import {
    readCompiledDbtManifest,
    readCompiledDbtProjectMap,
    saveCompiledDbtManifest,
    type CompiledDbtManifest,
} from '../../../services/ProjectService/compiledDbtManifest';
import { describeDbtProjectMap } from '../../../services/ProjectService/dbtProjectMap';
import {
    type IncrementalCompileResult,
    type ProjectService,
} from '../../../services/ProjectService/ProjectService';
import { startStepTimings } from '../../../utils/stepTimings';
import { type AiWritebackService } from '../AiWritebackService/AiWritebackService';
import {
    dbtChangeFingerprint,
    keepCheckedExplores,
    takeCheckedExplores,
    type StudioFileStorage,
} from './checkedExplores';
import {
    advanceCompiledManifest,
    findModelsToCompile,
    findNewCompileErrors,
    patchManifest,
    type DbtScriptChange,
    type DbtScriptCheck,
} from './dbtManifestPatch';
import {
    isModelExplore,
    usesAnyModel,
    type DraftChecker,
} from './DraftChecker';

export type IncrementalDbtCompileServiceArguments = {
    projectModel: {
        get: (
            projectUuid: string,
        ) => Promise<Pick<Project, 'organizationUuid' | 'dbtConnection'>>;
        findExploresByBaseTables: (
            projectUuid: string,
            baseTables: string[],
        ) => Promise<{ name: string; type: ExploreType | null }[]>;
        findExploresFromCache: (
            projectUuid: string,
            key: 'name',
            exploreNames?: string[],
        ) => Promise<Record<string, Explore | ExploreError>>;
    };
    projectService: Pick<
        ProjectService,
        'compileExploresFromManifest' | 'saveExploresToCacheAndIndexCatalog'
    >;
    checker: Pick<DraftChecker, 'findExploreError'>;
    fileStorageClient: StudioFileStorage;
    projectCompileLogModel: Pick<ProjectCompileLogModel, 'findLatestJobUuid'>;
    aiWritebackService: Pick<AiWritebackService, 'openStudioCheckout'>;
};

/** Compiles a dbt project's changes onto the manifest its last compile parsed, without dbt and without any Studio state. */
export class IncrementalDbtCompileService extends BaseService {
    private readonly projectModel: IncrementalDbtCompileServiceArguments['projectModel'];

    private readonly projectService: IncrementalDbtCompileServiceArguments['projectService'];

    private readonly checker: IncrementalDbtCompileServiceArguments['checker'];

    private readonly fileStorageClient: IncrementalDbtCompileServiceArguments['fileStorageClient'];

    private readonly projectCompileLogModel: IncrementalDbtCompileServiceArguments['projectCompileLogModel'];

    private readonly aiWritebackService: IncrementalDbtCompileServiceArguments['aiWritebackService'];

    constructor(args: IncrementalDbtCompileServiceArguments) {
        super();
        this.projectModel = args.projectModel;
        this.projectService = args.projectService;
        this.checker = args.checker;
        this.fileStorageClient = args.fileStorageClient;
        this.projectCompileLogModel = args.projectCompileLogModel;
        this.aiWritebackService = args.aiWritebackService;
    }

    /**
     * Compiles a code-mode change to a dbt project's YAML onto the manifest the
     * project's last compile parsed, without dbt, and checks what it reaches; with
     * `checkQueries`, each such explore is also compiled into queries and planned on
     * the warehouse. 'unsupported' says why the change needs dbt itself to run.
     */
    async checkDbtScriptChange(
        user: SessionUser,
        projectUuid: string,
        change: DbtScriptChange,
        options: { checkQueries: boolean },
    ): Promise<DbtScriptCheck> {
        const timings = startStepTimings();
        let result: DbtScriptCheck | null = null;
        try {
            result = await this.runDbtScriptCheck(
                user,
                projectUuid,
                change,
                options,
                timings.mark,
            );
            return result;
        } finally {
            this.logger.info('Semantic Studio dbt script check timed', {
                event: 'semantic_studio.check.timed',
                projectUuid,
                checkQueries: options.checkQueries,
                status: result?.status ?? 'error',
                exploreCount:
                    result?.status === 'passed' ? result.explores.length : null,
                ...timings.summary(),
            });
        }
    }

    private async runDbtScriptCheck(
        user: SessionUser,
        projectUuid: string,
        change: DbtScriptChange,
        { checkQueries }: { checkQueries: boolean },
        mark: (step: string) => void,
    ): Promise<DbtScriptCheck> {
        const stored = await readCompiledDbtManifest(
            this.fileStorageClient,
            projectUuid,
        );
        if (stored === null) {
            return {
                status: 'unsupported',
                reason: 'The project has no compiled manifest to check against',
            };
        }
        mark('manifestRead');
        const compiled =
            change.headCommitSha === null ||
            change.headCommitSha === stored.commitSha
                ? stored
                : await this.advanceCompiledDbtManifest(
                      projectUuid,
                      stored,
                      change.headCommitSha,
                      change,
                  );
        mark('manifestAdvance');
        const since = await change.listChangedSince(compiled.commitSha);
        if (since === null) {
            return {
                status: 'unsupported',
                reason: 'The branch cannot be compared with the compiled commit',
            };
        }
        const paths = [...new Set([...since, ...change.edits.keys()])];
        const files = await Promise.all(
            paths.map(async (path) => ({
                path,
                base: await change.readAt(path, compiled.commitSha),
                next: change.edits.has(path)
                    ? (change.edits.get(path) ?? null)
                    : await change.readHead(path),
            })),
        );
        mark('diffRead');
        const patch = patchManifest(compiled.manifest, files);
        mark('patch');
        if (patch.status === 'unsupported') return patch;
        if (patch.changedModels.length === 0) {
            return { status: 'passed', changedModels: [], explores: [] };
        }
        const { reached, uniqueIds } = findModelsToCompile(
            patch.manifest,
            patch.changedModels,
        );
        const changed = new Map(
            patch.changedModels.map((name) => [name, name]),
        );
        const reachedNames = new Set(reached);
        const lightdashConfigYaml = await change.readHead(
            'lightdash.config.yml',
        );
        const compiledExplores =
            await this.projectService.compileExploresFromManifest(
                user,
                projectUuid,
                patch.manifest,
                lightdashConfigYaml,
                uniqueIds,
            );
        const explores = compiledExplores.filter((explore) =>
            isExploreError(explore)
                ? reachedNames.has(explore.name)
                : usesAnyModel(explore, changed),
        );
        const live = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            explores.map(({ name }) => name),
        );
        const broken = findNewCompileErrors(explores, live);
        mark('compile');
        if (broken.length > 0) {
            return {
                status: 'failed',
                error: `It does not compile: ${broken.join('. ')}`,
            };
        }
        if (checkQueries) {
            const { organizationUuid } =
                await this.projectModel.get(projectUuid);
            const canRunSql = this.createAuditedAbility(user).can(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            );
            const findError = (explore: Explore) =>
                this.checker.findExploreError(user, projectUuid, explore, {
                    warehouse: canRunSql,
                });
            const errors = await Promise.all(
                explores
                    .flatMap((explore) =>
                        isExploreError(explore) ? [] : [explore],
                    )
                    .map(async (explore) => {
                        const error = await findError(explore);
                        if (error === null) return null;
                        const before = live[explore.name];
                        // Only what the change breaks counts; an explore that already fails is left as it is.
                        if (
                            before &&
                            !isExploreError(before) &&
                            (await findError(before)) !== null
                        ) {
                            return null;
                        }
                        return `${explore.name}: ${error}`;
                    }),
            );
            mark('plan');
            const found = errors.filter((error) => error !== null);
            if (found.length > 0) {
                return { status: 'failed', error: found.join('. ') };
            }
        }
        await keepCheckedExplores(
            this.fileStorageClient,
            projectUuid,
            dbtChangeFingerprint(
                compiled.commitSha,
                files,
                lightdashConfigYaml,
            ),
            compiledExplores,
        );
        return {
            status: 'passed',
            changedModels: patch.changedModels,
            explores,
        };
    }

    /** Moves the manifest saves are checked against on to the project branch's head; cached explores are left as compiled. */
    private async advanceCompiledDbtManifest(
        projectUuid: string,
        stored: CompiledDbtManifest,
        headCommitSha: string,
        change: DbtScriptChange,
    ): Promise<CompiledDbtManifest> {
        const startedAt = performance.now();
        const log = (outcome: Record<string, unknown>) =>
            this.logger.info('Semantic Studio compiled manifest advance', {
                event: 'semantic_studio.compiled_manifest.advanced',
                projectUuid,
                fromCommitSha: stored.commitSha,
                toCommitSha: headCommitSha,
                ...outcome,
                durationMs: Math.round(performance.now() - startedAt),
            });
        try {
            const advance = await advanceCompiledManifest(
                stored,
                headCommitSha,
                change,
            );
            if (advance.status === 'unsupported') {
                log({ status: 'unsupported', reason: advance.reason });
                return stored;
            }
            await saveCompiledDbtManifest(
                this.fileStorageClient,
                projectUuid,
                advance.compiled,
            );
            log({ status: 'advanced', files: advance.files });
            return advance.compiled;
        } catch (error) {
            log({ status: 'failed', error: getErrorMessage(error) });
            return stored;
        }
    }

    /** Saves only the explores a merged change reaches; null when only a full compile can be trusted, with why logged. */
    async compileAfterMerge(
        user: SessionUser,
        projectUuid: string,
        jobUuid: string,
    ): Promise<IncrementalCompileResult | null> {
        const startedAt = performance.now();
        const log = (outcome: Record<string, unknown>) =>
            this.logger.info('Semantic Studio compile after merge', {
                event: 'semantic_studio.compile_after_merge',
                projectUuid,
                jobUuid,
                ...outcome,
                durationMs: Math.round(performance.now() - startedAt),
            });
        const full = (reason: string) => {
            log({ mode: 'full', reason });
            return null;
        };
        try {
            const { dbtConnection } = await this.projectModel.get(projectUuid);
            if (dbtConnection.type !== DbtProjectType.GITHUB) {
                return full('The project is not in a GitHub repository');
            }
            if (dbtConnection.selector?.trim()) {
                return full('The project compiles a dbt selection');
            }
            const stored = await readCompiledDbtManifest(
                this.fileStorageClient,
                projectUuid,
            );
            if (stored === null) {
                return full('The project has no compiled manifest');
            }
            if (
                stored.exploresJobUuid === null ||
                stored.exploresJobUuid !==
                    (await this.projectCompileLogModel.findLatestJobUuid(
                        projectUuid,
                    ))
            ) {
                return full(
                    'The cached explores may not be what the compiled manifest compiles to',
                );
            }
            const { checkout, root } =
                await this.aiWritebackService.openStudioCheckout(
                    user,
                    projectUuid,
                    null,
                );
            const changed = await checkout.listFilesChangedSince(
                stored.commitSha,
            );
            if (changed === null) {
                return full(
                    'The branch cannot be compared with the compiled commit',
                );
            }
            if (changed.some((path) => !path.startsWith(root))) {
                return full('A file outside the dbt project changed');
            }
            const advance = await advanceCompiledManifest(
                stored,
                checkout.headSha,
                {
                    listChangedSince: async () =>
                        changed.map((path) => path.slice(root.length)),
                    readAt: (path, commitSha) =>
                        checkout.readFileAt(`${root}${path}`, commitSha),
                },
            );
            if (advance.status === 'unsupported') return full(advance.reason);
            const { manifest } = advance.compiled;
            const { reached, uniqueIds } = findModelsToCompile(
                manifest,
                advance.changedModels,
            );
            const reachedNames = new Set(reached);
            const lightdashConfigYaml = await checkout.readFileAt(
                `${root}lightdash.config.yml`,
                checkout.headSha,
            );
            const checked =
                reached.length === 0
                    ? null
                    : await takeCheckedExplores(
                          this.fileStorageClient,
                          projectUuid,
                          dbtChangeFingerprint(
                              stored.commitSha,
                              advance.changes,
                              lightdashConfigYaml,
                          ),
                      );
            const compiled =
                reached.length === 0
                    ? []
                    : (checked ??
                      (await this.projectService.compileExploresFromManifest(
                          user,
                          projectUuid,
                          manifest,
                          lightdashConfigYaml,
                          uniqueIds,
                      )));
            if (compiled.some(isExploreError)) {
                return full('An explore the change reaches does not compile');
            }
            // Explores of the models only compiled to be joined lack their own joins.
            const explores = compiled.filter(
                (explore): explore is Explore =>
                    !isExploreError(explore) &&
                    reachedNames.has(explore.baseTable),
            );
            // Pre-aggregate explores are built from the cache after a compile, and user-managed ones are not compiled at all.
            const cachedNames = (
                await this.projectModel.findExploresByBaseTables(
                    projectUuid,
                    reached,
                )
            ).flatMap(({ name, type }) => (isModelExplore(type) ? [name] : []));
            const exploreNames = new Set(explores.map(({ name }) => name));
            if (
                cachedNames.length !== exploreNames.size ||
                cachedNames.some((name) => !exploreNames.has(name))
            ) {
                return full('The change adds or removes an explore');
            }
            const broken = findNewCompileErrors(
                explores,
                await this.projectModel.findExploresFromCache(
                    projectUuid,
                    'name',
                    cachedNames,
                ),
            );
            if (broken.length > 0) {
                return full(`The change warns: ${broken.join('. ')}`);
            }
            const indexCatalogJobUuid =
                await this.projectService.saveExploresToCacheAndIndexCatalog({
                    userUuid: user.userUuid,
                    projectUuid,
                    explores,
                    complete: false,
                    compilationSource: 'refresh_dbt',
                    jobUuid,
                    requestMethod: RequestMethod.BACKEND,
                });
            await saveCompiledDbtManifest(this.fileStorageClient, projectUuid, {
                ...advance.compiled,
                exploresJobUuid: jobUuid,
            }).catch((error: unknown) => {
                // The compile log has moved on, so the next compile after a merge runs in full.
                this.logger.warn(
                    `SemanticStudio: failed to keep the patched manifest: ${getErrorMessage(error)}`,
                );
            });
            log({
                mode: 'incremental',
                compiledFrom: checked ? 'checked_change' : 'manifest',
                files: advance.files,
                changedModels: advance.changedModels.length,
                explores: explores.length,
                fromCommitSha: stored.commitSha,
                toCommitSha: checkout.headSha,
            });
            return {
                indexCatalogJobUuid,
                errorCount: 0,
                total: explores.length,
            };
        } catch (error) {
            if (error instanceof CompileInterruptedError) throw error;
            return full(`It failed: ${getErrorMessage(error)}`);
        }
    }

    /** The dbt project's layout from its last compile, for the agent's prompt; null when none is stored. */
    async getDbtProjectMap(projectUuid: string): Promise<string | null> {
        try {
            const stored = await readCompiledDbtProjectMap(
                this.fileStorageClient,
                projectUuid,
            );
            if (stored) return stored.map;
            // A manifest saved before maps were stored; its next compile stores one.
            const compiled = await readCompiledDbtManifest(
                this.fileStorageClient,
                projectUuid,
            );
            return compiled ? describeDbtProjectMap(compiled.manifest) : null;
        } catch (error) {
            this.logger.warn(
                `SemanticStudio: could not read the project map of ${projectUuid}: ${getErrorMessage(error)}`,
            );
            return null;
        }
    }
}

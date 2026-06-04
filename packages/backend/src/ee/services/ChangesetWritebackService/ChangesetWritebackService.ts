import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    type AiWritebackRunResult,
    type Change,
    type ChangesetWithChanges,
    type SessionUser,
} from '@lightdash/common';
import type { ChangesetModel } from '../../../models/ChangesetModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import type { AiWritebackService } from '../AiWritebackService/AiWritebackService';

type ChangesetWritebackServiceArguments = {
    changesetModel: ChangesetModel;
    projectModel: ProjectModel;
    aiWritebackService: AiWritebackService;
};

const describeChange = (change: Change): string => {
    const target = `${change.entityType} \`${change.entityName}\` on model \`${change.entityTableName}\``;
    switch (change.type) {
        case 'create': {
            const { value } = change.payload;
            return `Add a new ${value.type} metric \`${value.name}\` (label: "${value.label}") to model \`${value.table}\` with SQL: ${value.sql}`;
        }
        case 'update': {
            const patches = change.payload.patches
                .map(
                    (patch) =>
                        `set \`${patch.path}\` to ${JSON.stringify(patch.value)}`,
                )
                .join(', ');
            return `Update ${target}: ${patches}`;
        }
        case 'delete':
            return `Delete ${target}`;
        default:
            return `Apply change to ${target}`;
    }
};

/** Turn a changeset's structured changes into a prompt for the writeback agent. */
const buildPrompt = (changeset: ChangesetWithChanges): string => {
    const instructions = changeset.changes
        .map((change, index) => `${index + 1}. ${describeChange(change)}`)
        .join('\n');
    return [
        `Apply the following ${changeset.changes.length} semantic-layer change(s) from the Lightdash changeset "${changeset.name}" to the dbt project, then open a single pull request with all of them.`,
        '',
        instructions,
        '',
        'Make only the changes listed above. Preserve existing formatting and unrelated content.',
    ].join('\n');
};

export class ChangesetWritebackService extends BaseService {
    private readonly changesetModel: ChangesetModel;

    private readonly projectModel: ProjectModel;

    private readonly aiWritebackService: AiWritebackService;

    constructor(args: ChangesetWritebackServiceArguments) {
        super({ serviceName: 'ChangesetWritebackService' });
        this.changesetModel = args.changesetModel;
        this.projectModel = args.projectModel;
        this.aiWritebackService = args.aiWritebackService;
    }

    /**
     * Read the project's active changeset and write every change back to the dbt
     * project in a single pull request. Synchronous — the request is held open
     * until the writeback run completes. Requires `manage:SourceCode`; the
     * feature flag is enforced by AiWritebackService.run.
     */
    async writebackActiveChangeset(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AiWritebackRunResult> {
        const project = await this.projectModel.get(projectUuid);
        // Writeback opens a PR from a fresh feature branch, so mirror run()'s
        // gate: `manage:SourceCode` with `isProtectedBranch: false`.
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    isProtectedBranch: false,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const changeset =
            await this.changesetModel.findActiveChangesetWithChangesByProjectUuid(
                projectUuid,
            );
        if (!changeset || changeset.changes.length === 0) {
            throw new ParameterError(
                'There are no changes to write back for this project',
            );
        }

        return this.aiWritebackService.run({
            user,
            projectUuid,
            prompt: buildPrompt(changeset),
            source: 'changeset',
        });
    }
}

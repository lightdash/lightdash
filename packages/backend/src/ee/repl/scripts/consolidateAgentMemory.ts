import type { UUID } from '@lightdash/common';
import { ServiceRepository } from '../../../services/ServiceRepository';
import type {
    AiAgentMemoryManualConsolidationResult,
    AiAgentMemoryService,
} from '../../services/AiAgentMemoryService/AiAgentMemoryService';

/** On-demand consolidation for one partition from the backend REPL. */
export function getConsolidateAgentMemoryScripts(
    serviceRepository: ServiceRepository,
) {
    async function consolidateAgentMemory(args: {
        projectUuid: UUID;
        ownerUserUuid: UUID;
        /** The operator running the script, recorded on the run row. */
        triggeredByUserUuid: UUID;
        /** Overrides the configured dry-run mode for this run. */
        dryRun?: boolean;
    }): Promise<AiAgentMemoryManualConsolidationResult> {
        const service =
            serviceRepository.getAiAgentMemoryService<AiAgentMemoryService>();
        const result = await service.consolidatePartitionNow(args);

        if (!result.run) {
            console.log(
                `Consolidation ${result.outcome}: no run recorded for owner ${args.ownerUserUuid} in project ${args.projectUuid}`,
            );
            return result;
        }

        const { run } = result;
        const operationLabel = run.dry_run ? 'proposed' : 'applied';
        console.log(
            [
                `Consolidation ${result.outcome} (${run.status}${
                    run.dry_run ? ', dry run' : ''
                })`,
                `  run:      ${run.ai_agent_memory_consolidation_run_uuid}`,
                `  input:    ${run.input_count} memories (hash ${run.input_hash.slice(0, 12)})`,
                `  ${operationLabel}:  ${run.applied_count}`,
                `  rejected: ${run.rejected_count}`,
                ...(run.error_message
                    ? [`  error:    ${run.error_message}`]
                    : []),
            ].join('\n'),
        );
        return result;
    }

    return { consolidateAgentMemory };
}

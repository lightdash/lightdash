import { AnyType, SlackPromptJobPayload } from '@lightdash/common';
import { JobHelpers, TaskList } from 'graphile-worker';
import { SchedulerTaskArguments } from '../../scheduler/SchedulerTask';
import { SchedulerWorker } from '../../scheduler/SchedulerWorker';
import { AiService } from '../services/AiService/AiService';

type CommercialSchedulerWorkerArguments = SchedulerTaskArguments & {
    aiService: AiService;
};

export class CommercialSchedulerWorker extends SchedulerWorker {
    protected readonly aiService: AiService;

    constructor(args: CommercialSchedulerWorkerArguments) {
        super(args);
        this.aiService = args.aiService;
    }

    protected getTaskList(): TaskList {
        return {
            ...super.getTaskList(),
            aiPrompt: async (payload: AnyType, helpers: JobHelpers) => {
                await this.aiPrompt(
                    helpers.job.id,
                    helpers.job.run_at,
                    payload,
                );
            },
        };
    }

    protected async aiPrompt(
        _jobId: string,
        _scheduledTime: Date,
        payload: SlackPromptJobPayload,
    ) {
        await this.aiService.replyToSlackPrompt(payload.slackPromptUuid);
    }
}

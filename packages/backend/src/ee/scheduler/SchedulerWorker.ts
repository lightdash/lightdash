import { EE_SCHEDULER_TASKS } from '@lightdash/common';
import { SchedulerTaskArguments } from '../../scheduler/SchedulerTask';
import { SchedulerWorker } from '../../scheduler/SchedulerWorker';
import { TypedEETaskList } from '../../scheduler/types';
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

    protected getTaskList(): TypedEETaskList {
        return {
            ...super.getTaskList(),
            [EE_SCHEDULER_TASKS.SLACK_AI_PROMPT]: async (payload, _helpers) => {
                await this.aiService.replyToSlackPrompt(
                    payload.slackPromptUuid,
                );
            },
        };
    }
}

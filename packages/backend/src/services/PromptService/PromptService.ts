import { NotFoundError } from '@lightdash/common';
import { readFile } from 'fs/promises';
import path from 'path';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type LightdashConfig } from '../../config/parseConfig';
import { VERSION } from '../../version';
import { BaseService } from '../BaseService';

type PromptServiceArguments = {
    analytics: LightdashAnalytics;
    lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;
};

const PROMPTS_SOURCE_DIR = path.join(__dirname, 'prompts');

export class PromptService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;

    constructor({ analytics, lightdashConfig }: PromptServiceArguments) {
        super();
        this.analytics = analytics;
        this.lightdashConfig = lightdashConfig;
    }

    async getPrompt(name: string): Promise<string> {
        const availablePrompts = ['project-onboarding'];
        switch (name) {
            case 'project-onboarding':
                return this.readPrompt(name, 'projectOnboarding.md');
            default:
                throw new NotFoundError(
                    `Prompt not found: ${name}. Available prompts: ${availablePrompts.join(', ')}`,
                );
        }
    }

    private async readPrompt(name: string, fileName: string): Promise<string> {
        const prompt = (
            await readFile(path.join(PROMPTS_SOURCE_DIR, fileName), 'utf8')
        )
            .replaceAll(
                '<Lightdash instance URL>',
                this.lightdashConfig.siteUrl.replace(/\/+$/, ''),
            )
            .replaceAll('<Server-compatible CLI version>', VERSION);

        this.analytics.track({
            anonymousId: LightdashAnalytics.anonymousId,
            event: 'prompt.fetched',
            properties: { promptName: name },
        });

        return prompt;
    }
}

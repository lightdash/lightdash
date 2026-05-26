import Sandbox from 'e2b';
import type { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';

const TEMPLATE_NAME =
    process.env.E2B_TEMPLATE_NAME || 'lightdash-agentic-writeback';

type AgenticWritebackServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
};

export class AgenticWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
    }: AgenticWritebackServiceDeps) {
        super({ serviceName: 'AgenticWritebackService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
    }

    async run() {
        const sandbox = await Sandbox.create(TEMPLATE_NAME, {
            envs: {
                ANTHROPIC_API_KEY: this.lightdashConfig,
            },
        });

        await sandbox.git.clone(REPO_URL, {
            path: CWD,
            username: process.env.GIT_USERNAME,
            password: process.env.GIT_TOKEN,
        });
    }
}

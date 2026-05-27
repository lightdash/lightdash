import type { SessionUser } from '@lightdash/common';
import type { AiWritebackFailureStage } from '../../../analytics/LightdashAnalytics';
import type { DbAiWritebackThread } from '../../database/entities/ai';

export type GithubConnection = {
    owner: string;
    repo: string;
    projectSubPath: string;
};

export type GithubInstallation = {
    installationId: string;
    token: string;
};

export type SetStage = (stage: AiWritebackFailureStage) => void;

export type TurnContext = {
    organizationUuid: string;
    projectName: string;
    githubConnection: GithubConnection;
    existingRow: DbAiWritebackThread | null;
    isResume: boolean;
};

export type AppliedChanges = {
    prUrl: string | null;
    prCreated: boolean;
    pauseOnExit: boolean;
};

export type AiWritebackRunArgs = {
    user: SessionUser;
    projectUuid: string;
    prompt: string;
    aiThreadUuid?: string;
};

import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';

export class DbtGitlabProjectAdapter extends DbtGitProjectAdapter {
    constructor(
        gitlabPersonalAccessToken: string,
        gitlabRepository: string,
        gitlabBranch: string,
        projectDirectorySubPath: string,
        profilesDirectorySubPath: string,
        port: number,
        target: string | undefined,
    ) {
        const remoteRepositoryUrl = `https://:${gitlabPersonalAccessToken}@gitlab.com/${gitlabRepository}.git`;
        super(
            remoteRepositoryUrl,
            gitlabBranch,
            projectDirectorySubPath,
            profilesDirectorySubPath,
            port,
            target,
        );
    }
}

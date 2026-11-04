import { type ProjectService } from '../../../../services/ProjectService/ProjectService';

export const projectHooks = (service: ProjectService) =>
    service as unknown as {
        prepareConnectionExploreStream: ProjectService['prepareConnectionExploreStream'];
        saveExploresAndIndexCatalog: ProjectService['saveExploresAndIndexCatalog'];
        refreshTablesAndProjectConfig: ProjectService['refreshTablesAndProjectConfig'];
        withCompileAdapter: ProjectService['withCompileAdapter'];
        resolveCompileAdapter: ProjectService['resolveCompileAdapter'];
        getProjectContextFromAdapter: ProjectService['getProjectContextFromAdapter'];
        deleteMergedManifestBestEffort: ProjectService['deleteMergedManifestBestEffort'];
        replaceYamlTagsWithoutPermissionCheck: ProjectService['replaceYamlTagsWithoutPermissionCheck'];
        persistMergedManifest: ProjectService['persistMergedManifest'];
    };

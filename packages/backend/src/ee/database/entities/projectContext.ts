import { ProjectContextEntry } from '@lightdash/common';

export const ProjectContextDocumentTableName = 'project_context_document';

// The whole project_context file as one blob per project.
export type DbProjectContextDocument = {
    project_uuid: string;
    version: number;
    entries: ProjectContextEntry[];
    updated_at: Date;
};

import {
    generateSlug,
    getAiAgentDocumentFileExtension,
    getAiAgentDocumentMimeType,
    getErrorMessage,
    ParameterError,
    type AgentAsCode,
    type AgentAsCodeKnowledgeDocument,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';

export const KNOWLEDGE_DOCUMENTS_FOLDER_NAME = 'knowledge-documents';

const ACCEPTED_EXTENSIONS = ['.md', '.txt'];

// The file's extension carries the type, so the YAML lists neither content nor mimeType.
export type AgentAsCodeKnowledgeDocumentFile = Omit<
    AgentAsCodeKnowledgeDocument,
    'content' | 'mimeType'
> & {
    // Relative to the agent YAML's directory
    file: string;
};

/** The agent as it is written to YAML: document content lives in files. */
export type AgentAsCodeFile = Omit<AgentAsCode, 'knowledgeDocuments'> & {
    knowledgeDocuments?: AgentAsCodeKnowledgeDocumentFile[];
};

const isEnoent = (error: unknown): boolean =>
    (error as NodeJS.ErrnoException).code === 'ENOENT';

const toPosix = (filePath: string): string =>
    filePath.split(path.sep).join('/');

const getDocumentsFolder = (agentSlug: string): string =>
    path.join(agentSlug, KNOWLEDGE_DOCUMENTS_FOLDER_NAME);

const firstFreeFileName = (
    base: string,
    extension: string,
    taken: string[],
    index = 0,
): string => {
    const candidate = `${index === 0 ? base : `${base}-${index + 1}`}${extension}`;
    return taken.includes(candidate)
        ? firstFreeFileName(base, extension, taken, index + 1)
        : candidate;
};

/** Deterministic file names from document names; a slug clash within one agent gets a numeric suffix. */
const allocateFileNames = (
    documents: AgentAsCodeKnowledgeDocument[],
): string[] =>
    documents.reduce<string[]>(
        (taken, document) => [
            ...taken,
            firstFreeFileName(
                generateSlug(document.name),
                getAiAgentDocumentFileExtension(document.mimeType),
                taken,
            ),
        ],
        [],
    );

const listDocumentFiles = async (folder: string): Promise<string[]> => {
    try {
        return (await fs.readdir(folder, { withFileTypes: true }))
            .filter(
                (entry) =>
                    entry.isFile() &&
                    ACCEPTED_EXTENSIONS.some((extension) =>
                        entry.name.endsWith(extension),
                    ),
            )
            .map((entry) => entry.name);
    } catch (error) {
        if (isEnoent(error)) return [];
        throw error;
    }
};

export const toAgentAsCodeFile = (agent: AgentAsCode): AgentAsCodeFile => {
    const { knowledgeDocuments, ...rest } = agent;
    if (knowledgeDocuments === undefined) return rest;
    const fileNames = allocateFileNames(knowledgeDocuments);
    return {
        ...rest,
        knowledgeDocuments: knowledgeDocuments.map((document, index) => ({
            name: document.name,
            file: toPosix(
                path.join(getDocumentsFolder(agent.slug), fileNames[index]),
            ),
            alwaysIncludeInContext: document.alwaysIncludeInContext,
        })),
    };
};

// Writes `<slug>/knowledge-documents/` beside the YAML and prunes files no
// longer declared; an agent without a document list leaves the folder alone.
export const writeAgentKnowledgeDocuments = async (
    yamlDirectory: string,
    agent: AgentAsCode,
): Promise<void> => {
    if (agent.knowledgeDocuments === undefined) return;
    const folder = path.join(yamlDirectory, getDocumentsFolder(agent.slug));
    const fileNames = allocateFileNames(agent.knowledgeDocuments);
    const existing = await listDocumentFiles(folder);
    if (agent.knowledgeDocuments.length > 0) {
        await fs.mkdir(folder, { recursive: true });
    }
    await Promise.all([
        ...existing
            .filter((fileName) => !fileNames.includes(fileName))
            .map((fileName) => fs.rm(path.join(folder, fileName))),
        ...agent.knowledgeDocuments.map((document, index) =>
            fs.writeFile(path.join(folder, fileNames[index]), document.content),
        ),
    ]);
};

const assertSafeRelativeFile = (file: string, source: string): void => {
    const segments = file.split(/[\\/]/);
    if (
        path.isAbsolute(file) ||
        segments.some((segment) => segment === '..' || segment === '')
    ) {
        throw new ParameterError(
            `Invalid AI agent file "${source}": knowledge document file "${file}" must be a relative path inside the agent folder`,
        );
    }
    if (!ACCEPTED_EXTENSIONS.some((extension) => file.endsWith(extension))) {
        throw new ParameterError(
            `Invalid AI agent file "${source}": knowledge document file "${file}" must end with ${ACCEPTED_EXTENSIONS.join(' or ')}`,
        );
    }
};

const readDocumentFile = async (
    filePath: string,
    file: string,
    yamlPath: string,
): Promise<string> => {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (error) {
        throw new ParameterError(
            isEnoent(error)
                ? `Invalid AI agent file "${yamlPath}": knowledge document file "${file}" does not exist`
                : `Invalid AI agent file "${yamlPath}": could not read knowledge document file "${file}": ${getErrorMessage(error)}`,
        );
    }
};

/** Resolves each declared `file` against the YAML's directory and inlines its content for upload. */
export const readAgentKnowledgeDocuments = async (
    yamlPath: string,
    agent: AgentAsCodeFile,
): Promise<AgentAsCode> => {
    const { knowledgeDocuments, ...rest } = agent;
    if (knowledgeDocuments === undefined) return rest;
    if (!Array.isArray(knowledgeDocuments)) {
        throw new ParameterError(
            `Invalid AI agent file "${yamlPath}": knowledgeDocuments must be a list`,
        );
    }
    const directory = path.dirname(yamlPath);
    const resolved = await Promise.all(
        knowledgeDocuments.map(
            async (document): Promise<AgentAsCodeKnowledgeDocument> => {
                if (
                    typeof document !== 'object' ||
                    document === null ||
                    typeof document.file !== 'string' ||
                    typeof document.name !== 'string'
                ) {
                    throw new ParameterError(
                        `Invalid AI agent file "${yamlPath}": each knowledge document needs a name and a file`,
                    );
                }
                assertSafeRelativeFile(document.file, yamlPath);
                return {
                    name: document.name,
                    alwaysIncludeInContext:
                        document.alwaysIncludeInContext === true,
                    mimeType: getAiAgentDocumentMimeType(document.file),
                    content: await readDocumentFile(
                        path.join(directory, document.file),
                        document.file,
                        yamlPath,
                    ),
                };
            },
        ),
    );
    return { ...rest, knowledgeDocuments: resolved };
};

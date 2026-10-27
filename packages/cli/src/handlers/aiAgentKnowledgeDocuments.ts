import {
    generateSlug,
    getErrorMessage,
    ParameterError,
    type AgentAsCode,
    type AgentAsCodeKnowledgeDocument,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';

export const KNOWLEDGE_DOCUMENTS_FOLDER_NAME = 'knowledge-documents';

const ACCEPTED_EXTENSIONS = ['.md', '.txt'];

// The file's extension carries the type, so neither content nor mimeType is
// written to the YAML.
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

const getExtension = (
    mimeType: AgentAsCodeKnowledgeDocument['mimeType'],
): string => (mimeType === 'text/plain' ? '.txt' : '.md');

const getMimeType = (file: string): AgentAsCodeKnowledgeDocument['mimeType'] =>
    file.endsWith('.txt') ? 'text/plain' : 'text/markdown';

/** Deterministic file names from document names; a slug clash within one agent gets a numeric suffix. */
const allocateFileNames = (
    documents: AgentAsCodeKnowledgeDocument[],
): string[] =>
    documents.reduce<string[]>((taken, document) => {
        const base = generateSlug(document.name);
        const extension = getExtension(document.mimeType);
        const candidate = (index: number) =>
            `${index === 0 ? base : `${base}-${index + 1}`}${extension}`;
        let index = 0;
        while (taken.includes(candidate(index))) index += 1;
        return [...taken, candidate(index)];
    }, []);

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

/**
 * Writes the agent's document files under `<slug>/knowledge-documents/` next
 * to its YAML and removes document files that are no longer declared. The
 * folder is left alone when the agent carries no document list at all.
 */
export const writeAgentKnowledgeDocuments = async (
    yamlDirectory: string,
    agent: AgentAsCode,
): Promise<void> => {
    if (agent.knowledgeDocuments === undefined) return;
    const folder = path.join(yamlDirectory, getDocumentsFolder(agent.slug));
    const fileNames = allocateFileNames(agent.knowledgeDocuments);
    let existing: string[];
    try {
        existing = (await fs.readdir(folder, { withFileTypes: true }))
            .filter(
                (entry) =>
                    entry.isFile() &&
                    ACCEPTED_EXTENSIONS.some((extension) =>
                        entry.name.endsWith(extension),
                    ),
            )
            .map((entry) => entry.name);
    } catch (error) {
        if (!isEnoent(error)) throw error;
        existing = [];
    }
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
                let content: string;
                try {
                    content = await fs.readFile(
                        path.join(directory, document.file),
                        'utf8',
                    );
                } catch (error) {
                    throw new ParameterError(
                        isEnoent(error)
                            ? `Invalid AI agent file "${yamlPath}": knowledge document file "${document.file}" does not exist`
                            : `Invalid AI agent file "${yamlPath}": could not read knowledge document file "${document.file}": ${getErrorMessage(error)}`,
                    );
                }
                return {
                    name: document.name,
                    alwaysIncludeInContext:
                        document.alwaysIncludeInContext === true,
                    mimeType: getMimeType(document.file),
                    content,
                };
            },
        ),
    );
    return { ...rest, knowledgeDocuments: resolved };
};

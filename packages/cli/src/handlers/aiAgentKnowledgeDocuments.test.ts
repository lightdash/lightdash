import { ContentAsCodeType, type AgentAsCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    readAgentKnowledgeDocuments,
    toAgentAsCodeFile,
    writeAgentKnowledgeDocuments,
} from './aiAgentKnowledgeDocuments';

const agent = (
    knowledgeDocuments?: AgentAsCode['knowledgeDocuments'],
): AgentAsCode => ({
    contentType: ContentAsCodeType.AI_AGENT,
    version: 1,
    agentVersion: 2,
    slug: 'revenue-agent',
    name: 'Revenue agent',
    description: null,
    imageUrl: null,
    instruction: null,
    tags: null,
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: false,
    enableUserContext: false,
    modelConfig: null,
    ...(knowledgeDocuments !== undefined ? { knowledgeDocuments } : {}),
});

const glossary = {
    name: 'Revenue definitions',
    alwaysIncludeInContext: true,
    mimeType: 'text/markdown' as const,
    content: '# Revenue\n\nNet of refunds.\n',
};

describe('agent knowledge documents as files', () => {
    let agentsFolder: string;
    let yamlPath: string;

    beforeEach(async () => {
        agentsFolder = await fs.mkdtemp(
            path.join(os.tmpdir(), 'agent-knowledge-docs-'),
        );
        yamlPath = path.join(agentsFolder, 'revenue-agent.yml');
    });

    afterEach(async () => {
        await fs.rm(agentsFolder, { recursive: true, force: true });
    });

    it('writes each document to its own markdown file beside the agent and lists it in the YAML', async () => {
        const downloaded = agent([glossary]);

        await writeAgentKnowledgeDocuments(agentsFolder, downloaded);

        expect(toAgentAsCodeFile(downloaded).knowledgeDocuments).toEqual([
            {
                name: 'Revenue definitions',
                file: 'revenue-agent/knowledge-documents/revenue-definitions.md',
                alwaysIncludeInContext: true,
            },
        ]);
        await expect(
            fs.readFile(
                path.join(
                    agentsFolder,
                    'revenue-agent/knowledge-documents/revenue-definitions.md',
                ),
                'utf8',
            ),
        ).resolves.toBe(glossary.content);
    });

    it('round-trips: the files the download wrote upload with the same content', async () => {
        const downloaded = agent([
            glossary,
            {
                name: 'Refund policy',
                alwaysIncludeInContext: false,
                mimeType: 'text/plain' as const,
                content: 'x',
            },
        ]);
        await writeAgentKnowledgeDocuments(agentsFolder, downloaded);

        const uploaded = await readAgentKnowledgeDocuments(
            yamlPath,
            toAgentAsCodeFile(downloaded),
        );

        expect(uploaded).toEqual(downloaded);
        await expect(
            fs.readdir(
                path.join(agentsFolder, 'revenue-agent/knowledge-documents'),
            ),
        ).resolves.toEqual(['refund-policy.txt', 'revenue-definitions.md']);
    });

    it('removes document files the agent no longer declares', async () => {
        await writeAgentKnowledgeDocuments(agentsFolder, agent([glossary]));

        await writeAgentKnowledgeDocuments(agentsFolder, agent([]));

        await expect(
            fs.readdir(
                path.join(agentsFolder, 'revenue-agent/knowledge-documents'),
            ),
        ).resolves.toEqual([]);
    });

    it('leaves the folder alone when the agent carries no document list', async () => {
        await writeAgentKnowledgeDocuments(agentsFolder, agent([glossary]));

        await writeAgentKnowledgeDocuments(agentsFolder, agent());

        await expect(
            fs.readdir(
                path.join(agentsFolder, 'revenue-agent/knowledge-documents'),
            ),
        ).resolves.toEqual(['revenue-definitions.md']);
        expect(toAgentAsCodeFile(agent())).not.toHaveProperty(
            'knowledgeDocuments',
        );
    });

    it('keeps two documents whose names slug the same in separate files', async () => {
        const downloaded = agent([
            { ...glossary, name: 'Revenue definitions' },
            { ...glossary, name: 'revenue-definitions' },
        ]);
        const files =
            toAgentAsCodeFile(downloaded).knowledgeDocuments?.map(
                ({ file }) => file,
            ) ?? [];
        expect(new Set(files).size).toBe(2);
        files.forEach((file) =>
            expect(file).toMatch(
                /^revenue-agent\/knowledge-documents\/revenue-definitions-[0-9a-f]+\.md$/,
            ),
        );
    });

    it('reports a declared file that does not exist', async () => {
        await expect(
            readAgentKnowledgeDocuments(yamlPath, {
                ...agent(),
                knowledgeDocuments: [
                    {
                        name: 'Missing',
                        file: 'revenue-agent/knowledge-documents/missing.md',
                        alwaysIncludeInContext: false,
                    },
                ],
            }),
        ).rejects.toThrow('does not exist');
    });

    it('refuses a file outside the agent folder', async () => {
        await expect(
            readAgentKnowledgeDocuments(yamlPath, {
                ...agent(),
                knowledgeDocuments: [
                    {
                        name: 'Escape',
                        file: '../../etc/passwd.md',
                        alwaysIncludeInContext: false,
                    },
                ],
            }),
        ).rejects.toThrow('must be a relative path inside the agent folder');
    });
});

import {
    Anchor,
    Box,
    Code,
    List,
    Stack,
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import CodeBlock from '../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { SettingsCard } from '../../../../../../components/common/Settings/SettingsCard';
import useApp from '../../../../../../providers/App/useApp';
import ClaudeIcon from '../../../../../../svgs/anthropic.svg?react';
import ClaudeCodeIcon from '../../../../../../svgs/claude-code.svg?react';
import CursorIcon from '../../../../../../svgs/cursor.svg?react';
import OpenAiIcon from '../../../../../../svgs/openai.svg?react';
import VsCodeIcon from '../../../../../../svgs/vscode.svg?react';
import classes from './McpInstallationCard.module.css';

const LIGHTDASH_MCP_DOCS = 'https://docs.lightdash.com/agents/lightdash-mcp';

type Client = {
    id: string;
    name: string;
    icon: ReactNode;
    docsUrl: string;
    steps: { text: ReactNode; code?: string; language?: string }[];
};

const getClients = (url: string, t: TFunction): Client[] => {
    const quotedUrl = `'${url.replaceAll("'", "'\\''")}'`;

    return [
        {
            id: 'claude-desktop',
            name: 'Claude Desktop',
            icon: <ClaudeIcon className={classes.clientIcon} aria-hidden />,
            docsUrl:
                'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
            steps: [
                {
                    text: t('settings.mcpInstall.steps.claudeDesktop.s1'),
                },
                {
                    text: t('settings.mcpInstall.steps.claudeDesktop.s2'),
                    code: url,
                },
                {
                    text: t('settings.mcpInstall.steps.claudeDesktop.s3'),
                },
            ],
        },
        {
            id: 'claude-code',
            name: 'Claude Code',
            icon: <ClaudeCodeIcon className={classes.clientIcon} aria-hidden />,
            docsUrl: 'https://code.claude.com/docs/en/mcp',
            steps: [
                {
                    text: t('settings.mcpInstall.steps.claudeCode.s1'),
                    code: `claude mcp add --transport http lightdash ${quotedUrl}`,
                    language: 'bash',
                },
                {
                    text: (
                        <Trans
                            t={t}
                            i18nKey="settings.mcpInstall.steps.claudeCode.s2"
                            components={{ code: <Code /> }}
                        />
                    ),
                },
                {
                    text: t('settings.mcpInstall.steps.signInBrowser'),
                },
            ],
        },
        {
            id: 'codex',
            name: 'Codex',
            icon: <OpenAiIcon className={classes.clientIcon} aria-hidden />,
            docsUrl: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
            steps: [
                {
                    text: t('settings.mcpInstall.steps.codex.s1'),
                    code: `codex mcp add lightdash --url ${quotedUrl}\ncodex mcp login lightdash`,
                    language: 'bash',
                },
                {
                    text: t('settings.mcpInstall.steps.signInBrowser'),
                },
                {
                    text: t('settings.mcpInstall.steps.codex.s3'),
                },
            ],
        },
        {
            id: 'cursor',
            name: 'Cursor',
            icon: <CursorIcon className={classes.clientIcon} aria-hidden />,
            docsUrl: 'https://cursor.com/docs/mcp',
            steps: [
                {
                    text: (
                        <Trans
                            t={t}
                            i18nKey="settings.mcpInstall.steps.cursor.s1"
                            components={{ code: <Code /> }}
                        />
                    ),
                    code: JSON.stringify(
                        { mcpServers: { lightdash: { url } } },
                        null,
                        2,
                    ),
                    language: 'json',
                },
                {
                    text: t('settings.mcpInstall.steps.cursor.s2'),
                },
                {
                    text: t('settings.mcpInstall.steps.signInBrowser'),
                },
            ],
        },
        {
            id: 'vscode',
            name: 'VS Code',
            icon: <VsCodeIcon className={classes.vscodeIcon} aria-hidden />,
            docsUrl:
                'https://code.visualstudio.com/docs/agent-customization/mcp-servers',
            steps: [
                {
                    text: (
                        <Trans
                            t={t}
                            i18nKey="settings.mcpInstall.steps.vscode.s1"
                            components={{ code: <Code /> }}
                        />
                    ),
                    code: JSON.stringify(
                        { servers: { lightdash: { type: 'http', url } } },
                        null,
                        2,
                    ),
                    language: 'json',
                },
                {
                    text: (
                        <Trans
                            t={t}
                            i18nKey="settings.mcpInstall.steps.vscode.s2"
                            components={{ code: <Code /> }}
                        />
                    ),
                },
                {
                    text: t('settings.mcpInstall.steps.vscode.s3'),
                },
            ],
        },
        {
            id: 'other',
            name: t('settings.mcpInstall.otherClients'),
            icon: <MantineIcon icon={IconPlugConnected} size="md" />,
            docsUrl: `${LIGHTDASH_MCP_DOCS}#manual-setup`,
            steps: [
                {
                    text: t('settings.mcpInstall.steps.other.s1'),
                },
                {
                    text: t('settings.mcpInstall.steps.other.s2'),
                    code: url,
                },
                {
                    text: t('settings.mcpInstall.steps.other.s3'),
                },
            ],
        },
    ];
};

export const McpInstallationCard = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { health } = useApp();
    const siteUrl = health.data?.siteUrl ?? window.location.origin;
    const mcpUrl = `${siteUrl.replace(/\/+$/, '')}/api/v1/mcp`;
    const clients = getClients(mcpUrl, t);

    return (
        <SettingsCard p="md">
            <Stack gap="sm">
                <Stack gap={4}>
                    <Title order={5}>{t('settings.mcpInstall.title')}</Title>
                    <Text size="sm" c="dimmed">
                        {t('settings.mcpInstall.description')}
                    </Text>
                </Stack>
                <Tabs defaultValue="claude-desktop" keepMounted={false}>
                    <Box className={classes.tabScroller}>
                        <Tabs.List
                            className={classes.tabList}
                            aria-label={t('settings.mcpInstall.clientsAria')}
                        >
                            {clients.map((client) => (
                                <Tabs.Tab
                                    key={client.id}
                                    value={client.id}
                                    leftSection={client.icon}
                                >
                                    {client.name}
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                    </Box>
                    {clients.map((client) => (
                        <Tabs.Panel key={client.id} value={client.id} pt="sm">
                            <Stack gap="sm">
                                <List
                                    type="ordered"
                                    spacing="xs"
                                    size="sm"
                                    classNames={{
                                        itemWrapper: classes.step,
                                        itemLabel: classes.stepLabel,
                                    }}
                                >
                                    {client.steps.map((step, index) => (
                                        <List.Item key={index}>
                                            <Stack gap="xs">
                                                <Text size="sm">
                                                    {step.text}
                                                </Text>
                                                {step.code && (
                                                    <CodeBlock
                                                        code={step.code}
                                                        language={step.language}
                                                        copyLabel={t(
                                                            'settings.mcpInstall.copyLabel',
                                                            {
                                                                client: client.name,
                                                            },
                                                        )}
                                                    />
                                                )}
                                            </Stack>
                                        </List.Item>
                                    ))}
                                </List>
                                <Stack gap={4}>
                                    <Text size="xs" c="dimmed">
                                        <Trans
                                            t={t}
                                            i18nKey="settings.mcpInstall.moreDetails"
                                            values={{ client: client.name }}
                                            components={{
                                                anchor: (
                                                    <Anchor
                                                        href={client.docsUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        size="xs"
                                                    />
                                                ),
                                            }}
                                        />
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        <Trans
                                            t={t}
                                            i18nKey="settings.mcpInstall.permissions"
                                            components={{
                                                anchor: (
                                                    <Anchor
                                                        href={
                                                            LIGHTDASH_MCP_DOCS
                                                        }
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        size="xs"
                                                    />
                                                ),
                                            }}
                                        />
                                    </Text>
                                </Stack>
                            </Stack>
                        </Tabs.Panel>
                    ))}
                </Tabs>
            </Stack>
        </SettingsCard>
    );
};

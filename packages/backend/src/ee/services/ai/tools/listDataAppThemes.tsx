import {
    listDataAppThemesToolDefinition,
    type ToolListDataAppThemesStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    DataAppThemeSummary,
    ListDataAppThemesFn,
} from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listDataAppThemes: ListDataAppThemesFn;
};

const toolDefinition = listDataAppThemesToolDefinition.for('agent');

const renderTheme = (theme: DataAppThemeSummary) => (
    <theme slug={theme.slug} isDefault={theme.isDefault}>
        <name>{theme.name}</name>
        {theme.description === null ? null : (
            <description>{theme.description}</description>
        )}
    </theme>
);

const renderThemes = (themes: DataAppThemeSummary[]) =>
    themes.length === 0
        ? 'The organization has no themes. Omit themeSlug; tell the user no theme is available if they asked for one.'
        : (
              <themes count={themes.length}>{themes.map(renderTheme)}</themes>
          ).toString();

export const getListDataAppThemes = ({ listDataAppThemes }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (): Promise<
            | ExecuteStructuredToolResult<ToolListDataAppThemesStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const themes = await listDataAppThemes();
                return {
                    result: renderThemes(themes),
                    metadata: { status: 'success' },
                    structuredContent: { count: themes.length, themes },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error listing themes.');
            }
        },
    });

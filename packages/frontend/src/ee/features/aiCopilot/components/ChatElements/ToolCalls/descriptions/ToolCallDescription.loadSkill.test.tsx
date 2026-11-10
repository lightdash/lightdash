import type { AiAgentToolResult, ServedSkillMetadata } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { ToolCallDescription } from './ToolCallDescription';

const toolResultServing = (skill: ServedSkillMetadata): AiAgentToolResult => ({
    uuid: 'result-1',
    promptUuid: 'prompt-1',
    result: '',
    createdAt: new Date(),
    toolCallId: 'call-1',
    toolType: 'built-in',
    toolName: 'loadSkill',
    metadata: { status: 'success', skill },
});

const renderLoadSkill = (
    toolArgs: Record<string, string>,
    toolResult?: AiAgentToolResult,
) =>
    renderWithProviders(
        <ToolCallDescription
            toolName="loadSkill"
            toolCall={{ toolCallId: 'call-1', toolName: 'loadSkill', toolArgs }}
            toolResult={toolResult}
        />,
    );

describe('loadSkill tool activity', () => {
    it('shows the version a custom skill was served at', () => {
        renderLoadSkill(
            { name: 'quarterly-review' },
            toolResultServing({
                name: 'quarterly-review',
                builtIn: false,
                uuid: 'skill-uuid',
                versionNumber: 4,
                contentHash: 'hash',
            }),
        );
        expect(screen.getByText('quarterly-review')).toBeInTheDocument();
        expect(screen.getByText('v4')).toBeInTheDocument();
    });

    it('marks a built-in skill as built-in', () => {
        renderLoadSkill(
            { name: 'filter-expressions' },
            toolResultServing({
                name: 'filter-expressions',
                builtIn: true,
                uuid: null,
                versionNumber: null,
                contentHash: null,
            }),
        );
        expect(screen.getByText('built-in')).toBeInTheDocument();
    });

    it('shows the skill name before the result arrives', () => {
        renderLoadSkill({ name: 'quarterly-review' });
        expect(screen.getByText('quarterly-review')).toBeInTheDocument();
        expect(screen.queryByText(/^v\d+$/)).not.toBeInTheDocument();
    });
});

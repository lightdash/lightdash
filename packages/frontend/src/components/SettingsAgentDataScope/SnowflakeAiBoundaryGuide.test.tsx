import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { SnowflakeAiBoundaryGuide } from './SnowflakeAiBoundaryGuide';
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock('./AiTwinsGuide', () => ({
    AiTwinsGuide: () => <div>AI users guide</div>,
}));
vi.mock('./LegacySnowflakeAiBoundaryGuide', () => ({
    LegacySnowflakeAiBoundaryGuide: () => <div>Original guide</div>,
}));
describe('Snowflake guide feature gate', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([false, undefined])(
        'keeps the original guide when enabled is %s',
        (enabled) => {
            vi.mocked(useServerFeatureFlag).mockReturnValue({
                data: enabled === undefined ? undefined : { enabled },
            } as ReturnType<typeof useServerFeatureFlag>);
            render(
                <SnowflakeAiBoundaryGuide
                    projectUuid="project"
                    isSnowflake
                    showAiAccessRestrictions
                />,
            );
            expect(screen.getByText('Original guide')).toBeInTheDocument();
            expect(
                screen.queryByText('AI users guide'),
            ).not.toBeInTheDocument();
        },
    );
    it('mounts only the AI users guide when enabled', () => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: true },
        } as ReturnType<typeof useServerFeatureFlag>);
        render(
            <SnowflakeAiBoundaryGuide
                projectUuid="project"
                isSnowflake
                showAiAccessRestrictions
            />,
        );
        expect(screen.getByText('AI users guide')).toBeInTheDocument();
        expect(screen.queryByText('Original guide')).not.toBeInTheDocument();
    });
});

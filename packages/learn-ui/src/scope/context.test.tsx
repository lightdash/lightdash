import { render, screen } from '@testing-library/react';
import { type FC } from 'react';
import { describe, expect, it } from 'vitest';
import { LearnUiProvider, useScopeSource } from './context';
import { type ScopeSource } from './types';

const source: ScopeSource = {
    getAllScopeMap: () => ({}),
    getAllScopesForRole: () => ['view:Project'],
};

const Probe: FC = () => {
    const s = useScopeSource();
    return <span>{s.getAllScopesForRole('viewer').join(',')}</span>;
};

describe('LearnUiProvider', () => {
    it('hands the injected scope source to descendants', () => {
        render(
            <LearnUiProvider scopeSource={source}>
                <Probe />
            </LearnUiProvider>,
        );
        expect(screen.getByText('view:Project')).toBeInTheDocument();
    });

    it('throws a clear error without a provider', () => {
        expect(() => render(<Probe />)).toThrow(
            'useScopeSource must be used inside <LearnUiProvider>',
        );
    });
});

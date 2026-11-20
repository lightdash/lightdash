import { render, screen } from '@testing-library/react';
import { memo, useContext } from 'react';
import { expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { ColumnWindowingContext } from './ColumnWindowingContext';
import { ColumnWindowingProvider } from './ColumnWindowingProvider';

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const mockFlag = (enabled?: boolean) =>
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: enabled === undefined ? undefined : { enabled },
    } as ReturnType<typeof useServerFeatureFlag>);

it('only re-renders tables when the flag resolves on', () => {
    let renders = 0;
    const Table = memo(() => {
        renders += 1;
        return <span>{String(useContext(ColumnWindowingContext))}</span>;
    });
    const table = <Table />;
    const tree = () => (
        <ColumnWindowingProvider enabled>{table}</ColumnWindowingProvider>
    );

    mockFlag();
    const { rerender } = render(tree());
    expect(screen.getByText('false')).toBeInTheDocument();

    mockFlag(false);
    rerender(tree());
    expect(renders).toBe(1);

    mockFlag(true);
    rerender(tree());
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(renders).toBe(2);
});

it('does not ask for the flag until it is enabled', () => {
    mockFlag();
    render(
        <ColumnWindowingProvider enabled={false}>
            {null}
        </ColumnWindowingProvider>,
    );
    expect(useServerFeatureFlag).toHaveBeenLastCalledWith(
        'table-column-virtualization',
        { enabled: false },
    );
});

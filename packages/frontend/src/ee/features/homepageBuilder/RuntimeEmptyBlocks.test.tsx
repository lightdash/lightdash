import { render, screen } from '@testing-library/react';
import { type FC } from 'react';
import { describe, expect, it } from 'vitest';
import {
    useReportRuntimeEmpty,
    useRuntimeEmptyBlocks,
} from './hooks/useRuntimeEmptyBlocks';
import { RuntimeEmptyBlocksProvider } from './RuntimeEmptyBlocks';

const Block: FC<{ id: string; isEmpty: boolean; isLoading?: boolean }> = ({
    id,
    isEmpty,
    isLoading = false,
}) => {
    useReportRuntimeEmpty(id, isEmpty, isLoading);
    return <div data-testid={`block-${id}`} />;
};

// Mirrors RowRenderer: an all-empty row is *hidden*, never unmounted. If it
// unmounted, the block reporting the emptiness would unmount with it, its
// cleanup would clear the flag, the row would return, and the pair would
// oscillate forever.
const Row: FC<{ blockIds: string[] }> = ({ blockIds }) => {
    const { emptyBlockIds } = useRuntimeEmptyBlocks();
    const isEmpty = blockIds.every((id) => emptyBlockIds.has(id));
    return <div data-testid="row" data-runtime-empty={isEmpty || undefined} />;
};

const rowIsHidden = () =>
    screen.getByTestId('row').hasAttribute('data-runtime-empty');

describe('runtime empty blocks', () => {
    it('collapses a row once every block in it resolves to nothing', async () => {
        render(
            <RuntimeEmptyBlocksProvider>
                <Row blockIds={['a']} />
                <Block id="a" isEmpty />
            </RuntimeEmptyBlocksProvider>,
        );
        expect(await screen.findByTestId('block-a')).toBeInTheDocument();
        expect(rowIsHidden()).toBe(true);
    });

    it('keeps a row whose blocks have content', () => {
        render(
            <RuntimeEmptyBlocksProvider>
                <Row blockIds={['a']} />
                <Block id="a" isEmpty={false} />
            </RuntimeEmptyBlocksProvider>,
        );
        expect(rowIsHidden()).toBe(false);
    });

    it('keeps a row while a block is still loading, so it cannot flash', () => {
        render(
            <RuntimeEmptyBlocksProvider>
                <Row blockIds={['a']} />
                <Block id="a" isEmpty isLoading />
            </RuntimeEmptyBlocksProvider>,
        );
        expect(rowIsHidden()).toBe(false);
    });

    it('keeps a row when only some of its blocks are empty', () => {
        render(
            <RuntimeEmptyBlocksProvider>
                <Row blockIds={['a', 'b']} />
                <Block id="a" isEmpty />
                <Block id="b" isEmpty={false} />
            </RuntimeEmptyBlocksProvider>,
        );
        expect(rowIsHidden()).toBe(false);
    });

    it('forgets a block that unmounts, so it stops holding a row empty', () => {
        const { rerender } = render(
            <RuntimeEmptyBlocksProvider>
                <Row blockIds={['a']} />
                <Block id="a" isEmpty />
            </RuntimeEmptyBlocksProvider>,
        );
        expect(rowIsHidden()).toBe(true);

        rerender(
            <RuntimeEmptyBlocksProvider>
                <Row blockIds={['a']} />
            </RuntimeEmptyBlocksProvider>,
        );
        expect(rowIsHidden()).toBe(false);
    });
});

import { act, render } from '@testing-library/react';
import { type FC } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTileSelector } from './tileSelector';
import { usePortalTargets } from './usePortalTargets';

const Overlays: FC<{
    keys: string[];
    enabled: boolean;
    lockSiblings: boolean;
}> = ({ keys, enabled, lockSiblings }) => {
    const targets = usePortalTargets(
        keys,
        getTileSelector,
        enabled,
        lockSiblings,
    );
    return (
        <>
            {keys.map((key) =>
                targets[key]
                    ? createPortal(
                          <div data-controls-overlay data-testid={key}>
                              <button type="button">Card</button>
                          </div>,
                          targets[key],
                          key,
                      )
                    : null,
            )}
        </>
    );
};

const addTile = (uuid: string) => {
    const tile = document.createElement('div');
    tile.setAttribute('data-tile-uuid', uuid);
    const content = document.createElement('div');
    content.className = 'content';
    content.innerHTML = '<button type="button">Tile actions</button>';
    const handle = document.createElement('span');
    handle.className = 'react-resizable-handle';
    tile.append(content, handle);
    document.body.appendChild(tile);
    return { tile, content, handle };
};

// The hook re-resolves one frame after the DOM changes
const nextFrame = () =>
    act(
        () =>
            new Promise<void>((resolve) => {
                setTimeout(() => requestAnimationFrame(() => resolve()), 0);
            }),
    );

describe('usePortalTargets', () => {
    let one: ReturnType<typeof addTile>;
    let two: ReturnType<typeof addTile>;

    beforeEach(() => {
        one = addTile('one');
        two = addTile('two');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('makes the rest of a veiled tile inert, and not the overlay', () => {
        const { getByTestId } = render(
            <Overlays keys={['one']} enabled lockSiblings />,
        );

        expect(one.content).toHaveAttribute('inert');
        expect(one.handle).toHaveAttribute('inert');
        expect(getByTestId('one')).not.toHaveAttribute('inert');
        expect(getByTestId('one').parentElement).toBe(one.tile);
        expect(one.tile).not.toHaveAttribute('inert');
        // A tile with no overlay is left alone
        expect(two.content).not.toHaveAttribute('inert');
    });

    it('unlocks the tiles when the editor closes', () => {
        const { rerender } = render(
            <Overlays keys={['one', 'two']} enabled lockSiblings />,
        );
        expect(two.content).toHaveAttribute('inert');

        rerender(
            <Overlays keys={['one', 'two']} enabled={false} lockSiblings />,
        );
        expect(one.content).not.toHaveAttribute('inert');
        expect(one.handle).not.toHaveAttribute('inert');
        expect(two.content).not.toHaveAttribute('inert');
    });

    it('unlocks a tile that leaves the list, as on a tab change', () => {
        const { rerender } = render(
            <Overlays keys={['one', 'two']} enabled lockSiblings />,
        );

        rerender(<Overlays keys={['two']} enabled lockSiblings />);
        expect(one.content).not.toHaveAttribute('inert');
        expect(two.content).toHaveAttribute('inert');
    });

    it('unlocks the tiles when it unmounts', () => {
        const { unmount } = render(
            <Overlays keys={['one', 'two']} enabled lockSiblings />,
        );

        unmount();
        expect(one.content).not.toHaveAttribute('inert');
        expect(two.content).not.toHaveAttribute('inert');
    });

    it('locks content a tile mounts later, and a tile that arrives later', async () => {
        const { getByTestId } = render(
            <Overlays keys={['one', 'late']} enabled lockSiblings />,
        );
        const menu = document.createElement('div');
        one.tile.appendChild(menu);
        const late = addTile('late');
        await nextFrame();

        expect(menu).toHaveAttribute('inert');
        expect(late.content).toHaveAttribute('inert');
        expect(getByTestId('late')).not.toHaveAttribute('inert');
    });

    it('leaves alone what was inert before, and what it was not asked to lock', () => {
        one.content.setAttribute('inert', '');
        const { unmount } = render(
            <Overlays keys={['one']} enabled lockSiblings />,
        );
        unmount();
        expect(one.content).toHaveAttribute('inert');

        // Tab badges use the hook without locking anything
        render(<Overlays keys={['two']} enabled lockSiblings={false} />);
        expect(two.content).not.toHaveAttribute('inert');
    });
});

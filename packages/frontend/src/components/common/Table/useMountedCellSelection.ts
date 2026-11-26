import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

export type RegisterCell = (key: string) => () => void;

/**
 * Holds the key of the selected cell of a virtualized table. Cells register
 * their key while they are mounted. When no mounted cell holds the selected key
 * after a commit, the selection is cleared.
 *
 * A cell unmounts when its row or column leaves the rendered window, or when
 * the data changes. A merged cell keeps its key when it mounts again on another
 * row, so without this its selection comes back when its rows or its column
 * come back.
 */
export const useMountedCellSelection = () => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const mountedKeys = useRef(new Map<string, number>());
    // Read by the cells' effect cleanups, which run after layout effects.
    const selectedKeyRef = useRef<string | null>(null);
    useLayoutEffect(() => {
        selectedKeyRef.current = selectedKey;
    }, [selectedKey]);

    const registerCell = useCallback<RegisterCell>((key) => {
        const counts = mountedKeys.current;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return () => {
            const count = (counts.get(key) ?? 1) - 1;
            if (count > 0) {
                counts.set(key, count);
                return;
            }
            counts.delete(key);
            // A wide table unmounts many cells on one scroll. Only the
            // selected cell needs a check.
            if (selectedKeyRef.current !== key) return;
            // In the same commit, a cell with the same key can mount on
            // another row. Check after the commit.
            queueMicrotask(() => {
                if (counts.has(key) || selectedKeyRef.current !== key) return;
                selectedKeyRef.current = null;
                setSelectedKey(null);
            });
        };
    }, []);

    return { selectedKey, setSelectedKey, registerCell };
};

export const useRegisterMountedCell = (
    registerCell: RegisterCell | undefined,
    key: string | undefined,
) => {
    useEffect(
        () =>
            registerCell && key !== undefined ? registerCell(key) : undefined,
        [registerCell, key],
    );
};

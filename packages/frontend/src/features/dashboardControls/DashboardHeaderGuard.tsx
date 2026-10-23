import { useLayoutEffect, useRef, type ComponentProps, type FC } from 'react';
import DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import classes from './DashboardHeaderGuard.module.css';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = ComponentProps<typeof DashboardHeader>;

// The header's Save and Cancel, which stay live while the editor is open
const LIVE_SELECTOR = '[data-dashboard-edit-action]';

// Everything under root except the live elements and the path down to them
const getLockTargets = (root: Element): Element[] => {
    const live = [...root.querySelectorAll(LIVE_SELECTOR)];
    const lock = (parent: Element): Element[] =>
        [...parent.children].flatMap((child) => {
            if (live.includes(child)) return [];
            return live.some((element) => child.contains(element))
                ? lock(child)
                : [child];
        });
    return lock(root);
};

// While the editor is open the header is inert but for Save and Cancel, so
// nothing else in it (Add tile, a new chart) runs with the edit half done
const useLockHeader = (isLocked: boolean) => {
    const root = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = root.current;
        if (!isLocked || element === null) return;
        // Only what this effect made inert, so cleanup undoes exactly that
        const locked = new Set<Element>();
        const apply = () => {
            const wanted = new Set(getLockTargets(element));
            locked.forEach((target) => {
                if (wanted.has(target)) return;
                target.removeAttribute('inert');
                locked.delete(target);
            });
            wanted.forEach((target) => {
                if (target.hasAttribute('inert')) return;
                target.setAttribute('inert', '');
                locked.add(target);
            });
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(element, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            locked.forEach((target) => target.removeAttribute('inert'));
        };
    }, [isLocked]);
    return root;
};

// Save closes the editor as Done does, Cancel drops what it wrote; both then
// do what they do without it. Each is a no-op while the editor is closed
export const DashboardHeaderGuard: FC<Props> = (props) => {
    // A viewer's filter leaves the dashboard as it is: nothing to lock
    const isLocked = useControlsSidebarSelector(
        (c) => c.isSidebarOpen && !c.isViewer,
    );
    const close = useControlsSidebarSelector((c) => c.close);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const root = useLockHeader(isLocked);
    return (
        <div ref={root} className={classes.guard}>
            <DashboardHeader
                {...props}
                onSaveDashboard={() => {
                    close();
                    props.onSaveDashboard();
                }}
                onCancel={() => {
                    discard();
                    props.onCancel();
                }}
            />
        </div>
    );
};

import { type FC, type KeyboardEvent } from 'react';
import { ROLE_LABEL, SYSTEM_ROLES } from '../model/model';
import { type ProjectMemberRole } from '../scope/types';
import styles from './LearnBoard.module.css';

type Props = {
    role: ProjectMemberRole;
    onPick: (role: ProjectMemberRole, element: HTMLElement) => void;
};

// WAI-ARIA tabs: only the selected tab is tabbable, arrows move the selection.
const nextIndex = (key: string, current: number): number | null => {
    const last = SYSTEM_ROLES.length - 1;
    if (key === 'ArrowRight') return current === last ? 0 : current + 1;
    if (key === 'ArrowLeft') return current === 0 ? last : current - 1;
    if (key === 'Home') return 0;
    if (key === 'End') return last;
    return null;
};

export const RoleTabs: FC<Props> = ({ role, onPick }) => {
    const selectedIndex = SYSTEM_ROLES.indexOf(role);
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const target = nextIndex(event.key, selectedIndex);
        if (target === null) return;
        event.preventDefault();
        const tabs =
            event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
        const element = tabs[target];
        if (!element) return;
        element.focus();
        onPick(SYSTEM_ROLES[target], element);
    };

    return (
        <div
            className={styles.tabs}
            role="tablist"
            aria-label="Preview a role"
            onKeyDown={onKeyDown}
        >
            {SYSTEM_ROLES.map((candidate, index) => (
                <button
                    key={candidate}
                    type="button"
                    role="tab"
                    aria-selected={candidate === role}
                    tabIndex={index === selectedIndex ? 0 : -1}
                    className={`${styles.tab} ${candidate === role ? styles.tabSelected : ''}`}
                    onClick={(event) => onPick(candidate, event.currentTarget)}
                >
                    {ROLE_LABEL[candidate]}
                </button>
            ))}
        </div>
    );
};

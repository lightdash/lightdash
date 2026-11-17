import { type GuidedTourStep } from '../../GuidedTour';
import { EDIT_SHORTCUTS } from '../editShortcuts';
import { ShortcutHintsIntro, ShortcutList } from './ShortcutList';

export const DASHBOARD_EDIT_TOUR_STEPS: GuidedTourStep[] = [
    {
        target: null,
        title: 'Welcome to the new dashboard editor',
        body: 'Editing a dashboard got a lot easier. Tiles stay where you put them, and a new toolbar keeps the tools you need close. Take a quick look around, it takes less than a minute.',
    },
    {
        target: '[data-tour="dashboard-edit-bar"]',
        title: 'Meet the edit toolbar',
        body: <ShortcutHintsIntro />,
    },
    {
        target: '[data-tour="dashboard-edit-history"]',
        title: 'Undo and redo',
        body: (
            <ShortcutList
                intro="Moved or resized something by mistake? Step back and forward through your layout changes."
                shortcuts={[
                    { label: 'Undo', shortcut: EDIT_SHORTCUTS.undo },
                    { label: 'Redo', shortcut: EDIT_SHORTCUTS.redo },
                ]}
            />
        ),
    },
    {
        target: '[data-tour="dashboard-edit-tiles"]',
        title: 'Add and tidy tiles',
        body: (
            <ShortcutList
                intro="Add charts, markdown and more to the dashboard. Tidy closes the gaps between tiles in one click."
                shortcuts={[
                    { label: 'Add tile', shortcut: EDIT_SHORTCUTS.addTile },
                    { label: 'Tidy layout', shortcut: EDIT_SHORTCUTS.tidy },
                ]}
            />
        ),
    },
    {
        target: '[data-tour="dashboard-edit-zoom"]',
        title: 'Zoom the canvas',
        body: (
            <ShortcutList
                intro="Zoom out to arrange a long dashboard, or fit the whole thing on your screen. Viewers always see it at full size."
                shortcuts={[
                    { label: 'Zoom out', shortcut: EDIT_SHORTCUTS.zoomOut },
                    { label: 'Zoom in', shortcut: EDIT_SHORTCUTS.zoomIn },
                    {
                        label: 'Reset to 100%',
                        shortcut: EDIT_SHORTCUTS.zoomReset,
                    },
                    {
                        label: 'Zoom to fit',
                        shortcut: EDIT_SHORTCUTS.zoomToFit,
                    },
                ]}
            />
        ),
    },
    {
        target: '[data-tour="dashboard-edit-guides"]',
        title: 'Pick your guides',
        body: (
            <ShortcutList
                intro="Choose what sits behind your tiles while you edit: a grid, dots or column guides. They help you line things up and never show to viewers."
                shortcuts={[
                    {
                        label: 'Switch guides',
                        shortcut: EDIT_SHORTCUTS.background,
                    },
                ]}
            />
        ),
    },
    {
        target: '[data-tour="dashboard-edit-filters"]',
        title: 'Make room for the layout',
        body: (
            <ShortcutList
                intro="Show every filter, collapse them into a one-line summary, or hide the filters bar while you work on the layout."
                shortcuts={[
                    {
                        label: 'Switch filters view',
                        shortcut: EDIT_SHORTCUTS.filters,
                    },
                ]}
            />
        ),
    },
];

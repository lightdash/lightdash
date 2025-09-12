import { useMemo } from 'react';
import type { EventLogEntry } from '../types';
import styles from './EventMonitor.module.css';

interface EventMonitorProps {
    eventLog: EventLogEntry[];
    filterEventType: string;
    onFilterChange: (type: string) => void;
    onClearLog: () => void;
}

export function EventMonitor({
    eventLog,
    filterEventType,
    onFilterChange,
    onClearLog,
}: EventMonitorProps) {
    const filteredEvents = useMemo(() => {
        return eventLog.filter((entry) => {
            if (filterEventType === 'all') return true;
            return entry.event.type === filterEventType;
        });
    }, [eventLog, filterEventType]);

    const uniqueEventTypes = useMemo(() => {
        return Array.from(new Set(eventLog.map((entry) => entry.event.type)));
    }, [eventLog]);

    return (
        <div className={styles.eventsPanel}>
            <div className={styles.eventsHeader}>
                <h3>Event Monitor ({filteredEvents.length})</h3>
                <div className={styles.eventsControls}>
                    <select
                        value={filterEventType}
                        onChange={(e) => onFilterChange(e.target.value)}
                        className={styles.eventFilter}
                    >
                        <option value="all">All Events</option>
                        {uniqueEventTypes.map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </select>
                    <button onClick={onClearLog} className={styles.clearButton}>
                        Clear Log
                    </button>
                </div>
            </div>

            <div className={styles.eventsLog}>
                {filteredEvents.length === 0 ? (
                    <div className={styles.noEvents}>
                        <p>
                            No events received yet. Try changing filters in the
                            dashboard.
                        </p>
                    </div>
                ) : (
                    filteredEvents.map((entry) => (
                        <div key={entry.id} className={styles.eventEntry}>
                            <div className={styles.eventHeader}>
                                <span className={styles.eventType}>
                                    {entry.event.type}
                                </span>
                                <span className={styles.eventTime}>
                                    {entry.timestamp.toLocaleTimeString()}
                                </span>
                            </div>
                            <div className={styles.eventPayload}>
                                <pre>
                                    {JSON.stringify(
                                        entry.event.payload,
                                        null,
                                        2,
                                    )}
                                </pre>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
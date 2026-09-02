import { Text } from '@mantine/core';
import { useRef, useState, type FC, type FormEvent } from 'react';
import { groupMatches } from '../model/askView';
import { useLearnModel } from '../scope/context';
import {
    ASK_QUERY_MAX_LENGTH,
    type LearnAskMatch,
    type LearnAskSuggestion,
    type LearnCatalogueEntry,
} from '../types';
import styles from './LearnBoard.module.css';

export type AskBarProps = {
    entries: LearnCatalogueEntry[];
    suggestions: LearnAskSuggestion[];
    matches: LearnAskMatch[] | null;
    lockedIds: Set<string>;
    isSearching: boolean;
    isError: boolean;
    onSubmit: (query: string) => void;
    onClear: () => void;
    onOpen: (courseId: string, lessonId: string | null) => void;
};

export const AskBar: FC<AskBarProps> = ({
    entries,
    suggestions,
    matches,
    lockedIds,
    isSearching,
    isError,
    onSubmit,
    onClear,
    onOpen,
}) => {
    const { lockedNote } = useLearnModel();
    const [value, setValue] = useState('');
    const [submitted, setSubmitted] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const byId = new Map(entries.map((e) => [e.id, e]));

    const clear = () => {
        // Focus first: the × unmounts with the last character, and a focused
        // button removed in the same commit drops focus to the body.
        inputRef.current?.focus();
        setValue('');
        setSubmitted(null);
        onClear();
    };

    // A request in flight, or the question already answered on screen, means
    // there is nothing to send.
    const run = (query: string) => {
        if (isSearching) return;
        if (query === submitted && matches !== null && !isError) return;
        setSubmitted(query);
        onSubmit(query);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const query = value.trim();
        if (query === '') {
            clear();
            return;
        }
        run(query);
    };

    const runSuggestion = (query: string) => {
        setValue(query);
        run(query);
    };

    return (
        <div className={styles.ask}>
            <form className={styles.askForm} role="search" onSubmit={submit}>
                <input
                    ref={inputRef}
                    type="search"
                    className={styles.askInput}
                    aria-label="Ask the library"
                    placeholder="Ask a question about Lightdash"
                    maxLength={ASK_QUERY_MAX_LENGTH}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                />
                {value !== '' && (
                    <button
                        type="button"
                        className={styles.askClear}
                        aria-label="Clear search"
                        onClick={clear}
                    >
                        ×
                    </button>
                )}
                <button
                    type="submit"
                    className={styles.askSubmit}
                    disabled={isSearching}
                >
                    Ask
                </button>
            </form>

            {suggestions.length > 0 && (
                <div className={styles.askChips} data-testid="ask-chips">
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={`${suggestion.courseId}:${index}`}
                            type="button"
                            className={styles.askChip}
                            disabled={isSearching}
                            onClick={() => runSuggestion(suggestion.query)}
                        >
                            {suggestion.query}
                        </button>
                    ))}
                </div>
            )}

            {isSearching && (
                <Text size="sm" className={styles.muted}>
                    Searching…
                </Text>
            )}
            {isError && (
                <Text size="sm" className={styles.muted}>
                    Couldn&apos;t search right now
                </Text>
            )}
            {!isError && matches !== null && matches.length === 0 && (
                <Text size="sm" className={styles.muted}>
                    Nothing in the library matches that yet
                </Text>
            )}

            {!isError && matches !== null && matches.length > 0 && (
                <ul className={styles.askResults}>
                    {groupMatches(matches).map((group) => {
                        const entry = byId.get(group.courseId);
                        if (!entry) return null;
                        const locked = lockedIds.has(group.courseId);
                        return (
                            <li
                                key={group.courseId}
                                className={styles.askGroup}
                            >
                                <span className={styles.askModule}>
                                    {entry.title}
                                </span>
                                {/* A locked group names the role that holds it
                                    once, in place of every row's Open. */}
                                {locked && (
                                    <Text
                                        size="xs"
                                        className={styles.muted}
                                        data-testid="ask-locked-note"
                                    >
                                        {lockedNote(entry)}
                                    </Text>
                                )}
                                {group.matches.map((result, index) => (
                                    <span
                                        key={`${group.courseId}:${index}`}
                                        className={styles.askRow}
                                    >
                                        <span className={styles.askLesson}>
                                            {result.title}
                                        </span>
                                        {!locked && (
                                            <button
                                                type="button"
                                                className={styles.askOpen}
                                                onClick={() =>
                                                    onOpen(
                                                        result.courseId,
                                                        result.lessonId,
                                                    )
                                                }
                                            >
                                                Open
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

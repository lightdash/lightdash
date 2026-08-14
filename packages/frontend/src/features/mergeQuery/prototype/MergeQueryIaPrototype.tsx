import {
    IconArrowLeft,
    IconArrowRight,
    IconCheck,
    IconChevronDown,
    IconLink,
    IconPlus,
    IconTable,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import styles from './MergeQueryIaPrototype.module.css';

// Four merge-query IA variants, switchable via ?variant=A-D on the existing explorer route.

const variants = [
    { key: 'A', name: 'Tabs, config last' },
    { key: 'B', name: 'Guided steps' },
    { key: 'C', name: 'Source cards' },
    { key: 'D', name: 'Sentence builder' },
] as const;

type PrototypeState = {
    queryB: string | null;
    hasMetric: boolean;
    configured: boolean;
};

type VariantProps = PrototypeState & {
    queryA: string;
    chooseTable: (table: string) => void;
    clearTable: () => void;
    toggleMetric: () => void;
    configure: () => void;
};

const tables = ['Customers', 'Subscriptions', 'Payments', 'Support tickets'];

const TablePicker: FC<{ chooseTable: (table: string) => void }> = ({
    chooseTable,
}) => (
    <div className={styles.picker}>
        <div className={styles.pickerHeading}>Choose data to combine</div>
        <input
            className={styles.search}
            placeholder="Search tables…"
            aria-label="Search tables"
        />
        <div className={styles.tableList}>
            {tables.map((table) => (
                <button
                    className={styles.tableOption}
                    type="button"
                    key={table}
                    onClick={() => chooseTable(table)}
                >
                    <IconTable size={15} />
                    <span>{table}</span>
                    <IconArrowRight size={14} />
                </button>
            ))}
        </div>
    </div>
);

const FieldPicker: FC<{
    queryB: string;
    hasMetric: boolean;
    toggleMetric: () => void;
}> = ({ queryB, hasMetric, toggleMetric }) => (
    <div className={styles.fields}>
        <input
            className={styles.search}
            placeholder="Search metrics + dimensions…"
            aria-label="Search fields"
        />
        <div className={styles.fieldSection}>Dimensions</div>
        <button className={styles.field} type="button">
            <span className={styles.typeIcon}>123</span>
            {queryB === 'Customers' ? 'Customer ID' : `${queryB} ID`}
            <IconCheck size={14} />
        </button>
        <div className={styles.fieldSection}>Metrics</div>
        <button
            className={styles.field}
            data-selected={hasMetric}
            type="button"
            onClick={toggleMetric}
        >
            <span className={styles.typeIcon}>#</span>
            {queryB === 'Subscriptions'
                ? 'Active subscriptions'
                : `Total ${queryB.toLowerCase()}`}
            {hasMetric ? <IconCheck size={14} /> : <IconPlus size={14} />}
        </button>
    </div>
);

const JoinEditor: FC<{
    queryA: string;
    queryB: string;
    configured: boolean;
    configure: () => void;
}> = ({ queryA, queryB, configured, configure }) => (
    <div className={styles.joinEditor}>
        <div className={styles.joinTitle}>
            <IconLink size={15} />
            How should these queries match?
        </div>
        <div className={styles.joinSentence}>
            <button type="button">{queryA} · Order ID</button>
            <span>matches</span>
            <button type="button">
                {queryB} · {queryB} ID
            </button>
        </div>
        <div className={styles.keepRow}>
            <span>Keep</span>
            <div className={styles.segmented}>
                <button type="button" data-active>
                    All rows
                </button>
                <button type="button">{queryA}</button>
                <button type="button">Matches</button>
            </div>
        </div>
        <button className={styles.primary} type="button" onClick={configure}>
            {configured ? 'Relationship configured' : 'Use this relationship'}
        </button>
    </div>
);

const Tab: FC<{
    color: 'blue' | 'orange';
    active?: boolean;
    children: ReactNode;
}> = ({ color, active, children }) => (
    <button className={styles.tab} data-active={active} type="button">
        <span className={styles.dot} data-color={color} />
        {children}
    </button>
);

const VariantA: FC<VariantProps> = ({
    queryA,
    queryB,
    hasMetric,
    configured,
    chooseTable,
    clearTable,
    toggleMetric,
    configure,
}) => (
    <div className={styles.variant}>
        <div className={styles.variantEyebrow}>A · Sources first</div>
        <div className={styles.tabs}>
            <Tab color="blue">{queryA}</Tab>
            <Tab color="orange" active>
                {queryB ?? 'Choose a table'}
            </Tab>
            {queryB && (
                <button
                    className={styles.iconButton}
                    type="button"
                    aria-label="Change table"
                    onClick={clearTable}
                >
                    <IconChevronDown size={14} />
                </button>
            )}
        </div>
        {!queryB ? (
            <TablePicker chooseTable={chooseTable} />
        ) : (
            <>
                <div className={styles.hint}>
                    {hasMetric
                        ? 'Fields ready — configure how the queries match'
                        : 'Add a metric from this table'}
                    <button type="button" onClick={clearTable}>
                        Change table
                    </button>
                </div>
                <FieldPicker
                    queryB={queryB}
                    hasMetric={hasMetric}
                    toggleMetric={toggleMetric}
                />
                {hasMetric && (
                    <JoinEditor
                        queryA={queryA}
                        queryB={queryB}
                        configured={configured}
                        configure={configure}
                    />
                )}
            </>
        )}
    </div>
);

const Step: FC<{
    number: number;
    title: string;
    state: 'done' | 'active' | 'future';
}> = ({ number, title, state }) => (
    <div className={styles.step} data-state={state}>
        <span>{state === 'done' ? <IconCheck size={13} /> : number}</span>
        <strong>{title}</strong>
    </div>
);

const VariantB: FC<VariantProps> = ({
    queryA,
    queryB,
    hasMetric,
    configured,
    chooseTable,
    clearTable,
    toggleMetric,
    configure,
}) => {
    const stage = !queryB ? 2 : !hasMetric ? 2 : 3;
    return (
        <div className={styles.variant}>
            <div className={styles.variantEyebrow}>B · Guided setup</div>
            <div className={styles.steps}>
                <Step number={1} title={queryA} state="done" />
                <Step
                    number={2}
                    title={queryB ?? 'Add data'}
                    state={stage === 2 ? 'active' : 'done'}
                />
                <Step
                    number={3}
                    title="Combine"
                    state={stage === 3 ? 'active' : 'future'}
                />
            </div>
            <div className={styles.stepPanel}>
                <div className={styles.stepKicker}>Step {stage} of 3</div>
                <h2>
                    {!queryB
                        ? 'What do you want to combine with Orders?'
                        : !hasMetric
                          ? `What do you need from ${queryB}?`
                          : 'How should these results line up?'}
                </h2>
                {!queryB ? (
                    <TablePicker chooseTable={chooseTable} />
                ) : !hasMetric ? (
                    <>
                        <button
                            className={styles.backLink}
                            type="button"
                            onClick={clearTable}
                        >
                            <IconArrowLeft size={13} /> Change table
                        </button>
                        <FieldPicker
                            queryB={queryB}
                            hasMetric={hasMetric}
                            toggleMetric={toggleMetric}
                        />
                    </>
                ) : (
                    <JoinEditor
                        queryA={queryA}
                        queryB={queryB}
                        configured={configured}
                        configure={configure}
                    />
                )}
            </div>
        </div>
    );
};

const SourceCard: FC<{
    label: string;
    color: 'blue' | 'orange';
    detail: string;
    action?: ReactNode;
    children?: ReactNode;
}> = ({ label, color, detail, action, children }) => (
    <div className={styles.sourceCard} data-color={color}>
        <div className={styles.sourceHeader}>
            <span className={styles.dot} data-color={color} />
            <div>
                <strong>{label}</strong>
                <small>{detail}</small>
            </div>
            {action}
        </div>
        {children}
    </div>
);

const VariantC: FC<VariantProps> = ({
    queryA,
    queryB,
    hasMetric,
    configured,
    chooseTable,
    clearTable,
    toggleMetric,
    configure,
}) => (
    <div className={styles.variant}>
        <div className={styles.variantEyebrow}>C · Both sources visible</div>
        <div className={styles.sourceStack}>
            <SourceCard
                label={queryA}
                color="blue"
                detail="1 dimension · Order count"
            />
            <SourceCard
                label={queryB ?? 'Second query'}
                color="orange"
                detail={
                    !queryB
                        ? 'Choose another source'
                        : hasMetric
                          ? '1 dimension · 1 metric'
                          : 'Choose at least 1 metric'
                }
                action={
                    queryB ? (
                        <button type="button" onClick={clearTable}>
                            Change
                        </button>
                    ) : undefined
                }
            >
                {!queryB ? (
                    <TablePicker chooseTable={chooseTable} />
                ) : (
                    <FieldPicker
                        queryB={queryB}
                        hasMetric={hasMetric}
                        toggleMetric={toggleMetric}
                    />
                )}
            </SourceCard>
        </div>
        {queryB && hasMetric ? (
            <JoinEditor
                queryA={queryA}
                queryB={queryB}
                configured={configured}
                configure={configure}
            />
        ) : (
            <div className={styles.lockedRelationship}>
                <IconLink size={15} /> Relationship appears after both queries
                have fields
            </div>
        )}
    </div>
);

const Choice: FC<{
    children: ReactNode;
    empty?: boolean;
    onClick?: () => void;
}> = ({ children, empty, onClick }) => (
    <button
        className={styles.choice}
        data-empty={empty}
        type="button"
        onClick={onClick}
    >
        {children}
        <IconChevronDown size={13} />
    </button>
);

const VariantD: FC<VariantProps> = ({
    queryA,
    queryB,
    hasMetric,
    configured,
    chooseTable,
    clearTable,
    toggleMetric,
    configure,
}) => (
    <div className={styles.variant}>
        <div className={styles.variantEyebrow}>D · Sentence builder</div>
        <div className={styles.composer}>
            <div className={styles.composerLine}>
                <span>Combine</span>
                <Choice>{queryA}</Choice>
                <span>with</span>
                <Choice
                    empty={!queryB}
                    onClick={queryB ? clearTable : undefined}
                >
                    {queryB ?? 'choose a table'}
                </Choice>
            </div>
            {queryB && (
                <div className={styles.composerLine}>
                    <span>Match</span>
                    <Choice>Order ID</Choice>
                    <span>with</span>
                    <Choice>{queryB} ID</Choice>
                </div>
            )}
            {queryB && hasMetric && (
                <div className={styles.composerLine}>
                    <span>Keep</span>
                    <Choice>all rows</Choice>
                    <button
                        className={styles.inlineDone}
                        type="button"
                        onClick={configure}
                    >
                        {configured ? <IconCheck size={14} /> : 'Done'}
                    </button>
                </div>
            )}
        </div>
        <div className={styles.contextPanel}>
            {!queryB ? (
                <TablePicker chooseTable={chooseTable} />
            ) : (
                <>
                    <div className={styles.contextTitle}>
                        Add fields from {queryB}
                    </div>
                    <FieldPicker
                        queryB={queryB}
                        hasMetric={hasMetric}
                        toggleMetric={toggleMetric}
                    />
                </>
            )}
        </div>
    </div>
);

const variantComponents = {
    A: VariantA,
    B: VariantB,
    C: VariantC,
    D: VariantD,
} satisfies Record<string, FC<VariantProps>>;

const PrototypeSwitcher: FC<{
    current: string;
    state: PrototypeState;
}> = ({ current, state }) => {
    const [, setSearchParams] = useSearchParams();
    const currentIndex = Math.max(
        0,
        variants.findIndex((variant) => variant.key === current),
    );

    const move = (direction: -1 | 1) => {
        const next =
            variants[
                (currentIndex + direction + variants.length) % variants.length
            ];
        setSearchParams((previous) => {
            const params = new URLSearchParams(previous);
            params.set('variant', next.key);
            return params;
        });
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, textarea, [contenteditable="true"]')) {
                return;
            }
            if (event.key === 'ArrowLeft') move(-1);
            if (event.key === 'ArrowRight') move(1);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    return (
        <div className={styles.switcher}>
            <button
                type="button"
                aria-label="Previous variant"
                onClick={() => move(-1)}
            >
                <IconArrowLeft size={15} />
            </button>
            <div>
                <strong>
                    {variants[currentIndex].key} — {variants[currentIndex].name}
                </strong>
                <small>
                    A: Orders · B: {state.queryB ?? 'none'} · Metric:{' '}
                    {state.hasMetric ? 'yes' : 'no'} · Join:{' '}
                    {state.configured ? 'ready' : 'not ready'}
                </small>
            </div>
            <button
                type="button"
                aria-label="Next variant"
                onClick={() => move(1)}
            >
                <IconArrowRight size={15} />
            </button>
        </div>
    );
};

export const MergeQueryIaPrototype: FC<{ queryALabel: string }> = ({
    queryALabel,
}) => {
    const [searchParams] = useSearchParams();
    const requestedVariant = searchParams.get('variant') ?? 'A';
    const variant =
        requestedVariant in variantComponents ? requestedVariant : 'A';
    const Variant =
        variantComponents[variant as keyof typeof variantComponents];
    const [state, setState] = useState<PrototypeState>({
        queryB: null,
        hasMetric: false,
        configured: false,
    });

    const props: VariantProps = {
        queryA: queryALabel,
        ...state,
        chooseTable: (queryB) =>
            setState({ queryB, hasMetric: false, configured: false }),
        clearTable: () =>
            setState({ queryB: null, hasMetric: false, configured: false }),
        toggleMetric: () =>
            setState((previous) => ({
                ...previous,
                hasMetric: !previous.hasMetric,
                configured: false,
            })),
        configure: () =>
            setState((previous) => ({ ...previous, configured: true })),
    };

    return (
        <div className={styles.prototype}>
            <div className={styles.prototypeNotice}>
                PROTOTYPE · Merge query information architecture
                <button
                    type="button"
                    aria-label="Reset prototype"
                    onClick={() =>
                        setState({
                            queryB: null,
                            hasMetric: false,
                            configured: false,
                        })
                    }
                >
                    <IconX size={13} /> Reset
                </button>
            </div>
            <Variant {...props} />
            <PrototypeSwitcher current={variant} state={state} />
        </div>
    );
};

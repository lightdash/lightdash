import {
    convertItemTypeToDimensionType,
    DimensionType,
    getItemLabelWithoutTableName,
    isDimension,
    type CustomDimension,
    type Dimension,
} from '@lightdash/common';

export type JoinFieldCandidate = Dimension | CustomDimension;

const normalize = (value: string) =>
    value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');

const isTemporal = (type: DimensionType) =>
    type === DimensionType.DATE || type === DimensionType.TIMESTAMP;

const grainOf = (item: JoinFieldCandidate) =>
    isDimension(item) ? (item.timeInterval ?? null) : null;

/**
 * Whether the validator would accept joining these two fields: the same
 * kind of value, and for dates the same grain. This is the rule the server
 * refuses on, so the picker can say it before Run does.
 */
const isJoinableWith = (
    candidate: JoinFieldCandidate,
    counterpart: JoinFieldCandidate,
): boolean => {
    const candidateType = convertItemTypeToDimensionType(candidate);
    const counterpartType = convertItemTypeToDimensionType(counterpart);
    if (isTemporal(candidateType) !== isTemporal(counterpartType)) {
        return false;
    }
    if (isTemporal(candidateType)) {
        // Date and timestamp are one class to the validator; only the grain must match.
        return grainOf(candidate) === grainOf(counterpart);
    }
    return candidateType === counterpartType;
};

/**
 * How likely a joinable field is to be the intended key: the same name
 * first, then the same label, then an identifier. Zero means joinable but
 * nothing else recommends it.
 */
const scoreJoinCandidate = (
    candidate: JoinFieldCandidate,
    counterpart: JoinFieldCandidate,
): number => {
    const sameName = normalize(candidate.name) === normalize(counterpart.name);
    const sameLabel =
        normalize(getItemLabelWithoutTableName(candidate)) ===
        normalize(getItemLabelWithoutTableName(counterpart));
    const identifier = /(^|_)id$|(^|_)key$/i.test(candidate.name);
    return (
        (sameName ? 6 : 0) +
        (sameLabel ? 4 : 0) +
        (sameName || sameLabel ? (identifier ? 2 : 0) : 0)
    );
};

export type RankedJoinFieldCandidates<T extends JoinFieldCandidate> = {
    /** Joinable fields something recommends, best first. */
    suggested: T[];
    /** Fields the validator would refuse against the counterpart. */
    incompatible: T[];
};

/**
 * Sorts a side's fields against the field chosen on the other side. With no
 * counterpart yet there is nothing to rank against, so nothing is suggested
 * and nothing is ruled out.
 */
export const rankJoinFieldCandidates = <T extends JoinFieldCandidate>(
    candidates: T[],
    counterpart: JoinFieldCandidate | undefined,
): RankedJoinFieldCandidates<T> => {
    if (!counterpart) return { suggested: [], incompatible: [] };
    const scored = candidates.map((candidate) => ({
        candidate,
        score: isJoinableWith(candidate, counterpart)
            ? scoreJoinCandidate(candidate, counterpart)
            : null,
    }));
    return {
        suggested: scored
            .filter(({ score }) => score !== null && score > 0)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .map(({ candidate }) => candidate),
        incompatible: scored
            .filter(({ score }) => score === null)
            .map(({ candidate }) => candidate),
    };
};

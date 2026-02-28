/**
 * Group consecutive items where adjacent elements satisfy the predicate.
 * Items must be pre-sorted (ascending or descending).
 */
export const groupConsecutive = <T>(
    items: T[],
    isSameGroup: (a: T, b: T) => boolean,
): T[][] => {
    if (items.length === 0) return [];
    const groups: T[][] = [[items[0]]];
    for (let i = 1; i < items.length; i++) {
        const current = items[i];
        const prev = items[i - 1];
        if (isSameGroup(prev, current)) {
            groups[groups.length - 1].push(current);
        } else {
            groups.push([current]);
        }
    }
    return groups;
};

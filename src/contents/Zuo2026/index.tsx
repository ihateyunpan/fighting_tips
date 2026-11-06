import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';

/** Element types: 7 listed in spec (地水火风阴阳混沌). */
const ELEMENTS = ['地', '水', '火', '风', '阴', '阳', '混沌'] as const;
export type ElementType = (typeof ELEMENTS)[number];

const PROFESSIONS = ['破军', '龙盾', '神纪', '歧黄', '诡道'] as const;
export type ProfessionType = (typeof PROFESSIONS)[number];

const ELEMENT_CLASS: Record<ElementType, string> = {
    地: 'bg-amber-700 text-white border-amber-800',
    水: 'bg-sky-600 text-white border-sky-700',
    火: 'bg-red-600 text-white border-red-700',
    风: 'bg-emerald-600 text-white border-emerald-700',
    阴: 'bg-violet-700 text-white border-violet-800',
    阳: 'bg-amber-400 text-amber-950 border-amber-500',
    混沌: 'bg-slate-600 text-white border-slate-700',
};

const MAX_COMBINATIONS = 500_000;

type ItemMode = 'adjacent' | 'gap1' | 'hoeOnly' | 'bottleOnly';

function hasCounterRelation(a: ElementType, b: ElementType): boolean {
    if (a === b) return false;
    if (a === '混沌' || b === '混沌') return false;
    const cycle: ElementType[] = ['地', '水', '火', '风'];
    const ia = cycle.indexOf(a);
    const ib = cycle.indexOf(b);
    if (ia !== -1 && ib !== -1) {
        return (ia + 1) % 4 === ib || (ib + 1) % 4 === ia;
    }
    if ((a === '阴' && b === '阳') || (a === '阳' && b === '阴')) return true;
    return false;
}

/** Shortest edge distance on cycle graph (1 = adjacent including wrap). */
function circDist(n: number, i: number, j: number): number {
    const d = Math.abs(i - j);
    return Math.min(d, n - d);
}

function findHoeIndex(n: number, elements: ElementType[]): number | null {
    for (let i = 0; i < n; i++) {
        const B = i;
        const A = (i - 1 + n) % n;
        const C = (i + 1) % n;
        const ab = hasCounterRelation(elements[A], elements[B]);
        const bc = hasCounterRelation(elements[B], elements[C]);
        if (ab && bc) return i;
    }
    return null;
}

function findBottleIndex(n: number, professions: ProfessionType[]): number | null {
    for (let i = 0; i < n; i++) {
        const A = (i - 1 + n) % n;
        const B = i;
        const C = (i + 1) % n;
        if (professions[A] === professions[B] && professions[B] === professions[C]) {
            return i;
        }
    }
    return null;
}

function passesItemMode(
    mode: ItemMode,
    n: number,
    hoe: number | null,
    bottle: number | null,
): boolean {
    if (mode === 'hoeOnly') {
        return hoe !== null && bottle === null;
    }
    if (mode === 'bottleOnly') {
        return bottle !== null && hoe === null;
    }
    if (hoe === null || bottle === null) return false;
    const d = circDist(n, hoe, bottle);
    if (mode === 'adjacent') return d === 1;
    if (mode === 'gap1') return d === 2;
    return false;
}

interface SlotConstraint {
    elements: ElementType[];
    professions: ProfessionType[];
}

function factorial(n: number): number {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
}

/** Count: assign each of n teammates a (attr, prof), then permute who stands in which slot (n! ways). */
function productSizeTeam(slots: SlotConstraint[]): number {
    const n = slots.length;
    if (n === 0) return 0;
    const perPerson = slots.reduce((acc, s) => acc * s.elements.length * s.professions.length, 1);
    return perPerson * factorial(n);
}

/** Lexicographic next permutation of distinct indices 0..n-1; returns false if current is last. */
function nextPermutationIndices(perm: number[]): boolean {
    const n = perm.length;
    let i = n - 1;
    while (i >= 1 && perm[i - 1] >= perm[i]!) i--;
    if (i === 0) return false;
    let j = n - 1;
    while (perm[j]! <= perm[i - 1]!) j--;
    const t = perm[i - 1]!;
    perm[i - 1] = perm[j]!;
    perm[j] = t;
    let lo = i;
    let hi = n - 1;
    while (lo < hi) {
        const s = perm[lo]!;
        perm[lo] = perm[hi]!;
        perm[hi] = s;
        lo++;
        hi--;
    }
    return true;
}

function *enumerateAssignments(slots: SlotConstraint[]): Generator<{
    elements: ElementType[];
    professions: ProfessionType[];
}> {
    const n = slots.length;
    if (n === 0) return;
    const pairLen = slots.map((s) => s.elements.length * s.professions.length);
    const t = slots.map(() => 0);

    const elBuf: ElementType[] = new Array(n);
    const prBuf: ProfessionType[] = new Array(n);
    const perm = Array.from({ length: n }, (_, i) => i);

    while (true) {
        for (let i = 0; i < n; i++) {
            const ti = t[i]!;
            const np = slots[i].professions.length;
            const ei = Math.floor(ti / np);
            const pi = ti % np;
            elBuf[i] = slots[i].elements[ei]!;
            prBuf[i] = slots[i].professions[pi]!;
        }

        for (let p = 0; p < n; p++) perm[p] = p;
        while (true) {
            yield {
                elements: perm.map((j) => elBuf[j]!),
                professions: perm.map((j) => prBuf[j]!),
            };
            if (!nextPermutationIndices(perm)) break;
        }

        let k = n - 1;
        while (k >= 0) {
            t[k]++;
            if (t[k]! < pairLen[k]!) break;
            t[k] = 0;
            k--;
        }
        if (k < 0) return;
    }
}

interface ResultRow {
    elements: ElementType[];
    professions: ProfessionType[];
    hoe: number | null;
    bottle: number | null;
}

/** Stable key: same attr+prof sequence (order matters) => one row. */
function assignmentKey(elements: ElementType[], professions: ProfessionType[]): string {
    return JSON.stringify({ e: elements, p: professions });
}

/** Per battle slot (1..n column): optional attr/prof filter for the result table only. */
interface SlotDisplayFilter {
    element: ElementType | null;
    profession: ProfessionType | null;
}

const EMPTY_SLOT_FILTERS: SlotDisplayFilter[] = Array.from({ length: 5 }, () => ({
    element: null,
    profession: null,
}));

function SlotPickers({
    n,
    slots,
    setSlots,
}: {
    n: number;
    slots: SlotConstraint[];
    setSlots: Dispatch<SetStateAction<SlotConstraint[]>>;
}) {
    const [openAttr, setOpenAttr] = useState<number | null>(null);
    const [openProf, setOpenProf] = useState<number | null>(null);

    return (
        <div className="flex flex-wrap items-end gap-2">
            {Array.from({ length: n }, (_, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                    {/* overflow-visible so absolute dropdowns are not clipped */}
                    <div className="flex w-[4.5rem] flex-col rounded border border-slate-300 overflow-visible">
                        {/* Raise stack when open: lower row used z-20 and covered this dropdown */}
                        <div className={`relative ${openAttr === i ? 'z-[100]' : 'z-0'}`}>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenProf(null);
                                    setOpenAttr((x) => (x === i ? null : i));
                                }}
                                className={`flex w-full items-center justify-center border-b border-slate-300 px-1 py-1.5 text-xs font-medium ${
                                    slots[i].elements.length === ELEMENTS.length
                                        ? 'bg-slate-100 text-slate-600'
                                        : ELEMENT_CLASS[slots[i].elements[0]!]
                                }`}
                            >
                                {slots[i].elements.length === ELEMENTS.length
                                    ? '属性'
                                    : slots[i].elements.length === 1
                                      ? slots[i].elements[0]
                                      : `${slots[i].elements.length}项`}
                            </button>
                            {openAttr === i && (
                                <ul className="absolute left-0 top-full z-[60] mt-0.5 max-h-56 min-w-[4.5rem] w-max max-w-[min(12rem,90vw)] overflow-auto rounded border border-slate-200 bg-white py-0.5 shadow-lg">
                                    <li>
                                        <button
                                            type="button"
                                            className="w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                            onClick={() => {
                                                setSlots((prev) =>
                                                    prev.map((s, j) =>
                                                        j === i ? { ...s, elements: [...ELEMENTS] } : s,
                                                    ),
                                                );
                                                setOpenAttr(null);
                                            }}
                                        >
                                            不指定
                                        </button>
                                    </li>
                                    {ELEMENTS.map((el) => (
                                        <li key={el}>
                                            <button
                                                type="button"
                                                className={`w-full px-2 py-1.5 text-left text-xs hover:opacity-90 ${ELEMENT_CLASS[el]}`}
                                                onClick={() => {
                                                    setSlots((prev) =>
                                                        prev.map((s, j) =>
                                                            j === i ? { ...s, elements: [el] } : s,
                                                        ),
                                                    );
                                                    setOpenAttr(null);
                                                }}
                                            >
                                                {el}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className={`relative ${openProf === i ? 'z-[100]' : 'z-0'}`}>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenAttr(null);
                                    setOpenProf((x) => (x === i ? null : i));
                                }}
                                className="flex w-full items-center justify-center px-1 py-1.5 text-xs font-medium bg-white text-slate-700 hover:bg-slate-50"
                            >
                                {slots[i].professions.length === PROFESSIONS.length
                                    ? '职业'
                                    : slots[i].professions.length === 1
                                      ? slots[i].professions[0]
                                      : `${slots[i].professions.length}项`}
                            </button>
                            {openProf === i && (
                                <ul className="absolute left-0 top-full z-[60] mt-0.5 max-h-56 min-w-[4.5rem] w-max max-w-[min(12rem,90vw)] overflow-auto rounded border border-slate-200 bg-white py-0.5 shadow-lg">
                                    <li>
                                        <button
                                            type="button"
                                            className="w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                            onClick={() => {
                                                setSlots((prev) =>
                                                    prev.map((s, j) =>
                                                        j === i
                                                            ? { ...s, professions: [...PROFESSIONS] }
                                                            : s,
                                                    ),
                                                );
                                                setOpenProf(null);
                                            }}
                                        >
                                            不指定
                                        </button>
                                    </li>
                                    {PROFESSIONS.map((pr) => (
                                        <li key={pr}>
                                            <button
                                                type="button"
                                                className="w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                                                onClick={() => {
                                                    setSlots((prev) =>
                                                        prev.map((s, j) =>
                                                            j === i ? { ...s, professions: [pr] } : s,
                                                        ),
                                                    );
                                                    setOpenProf(null);
                                                }}
                                            >
                                                {pr}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                    <span className="text-xs text-slate-500">{String.fromCharCode(65 + i)}</span>
                </div>
            ))}
        </div>
    );
}

function teamRequirementsKey(teamSize: number, itemMode: ItemMode, slots: SlotConstraint[]): string {
    const slice = slots.slice(0, teamSize).map((s) => ({
        e: s.elements.slice(),
        p: s.professions.slice(),
    }));
    return JSON.stringify({ teamSize, itemMode, slots: slice });
}

export default function Zuo2026TeamBuilder() {
    const [teamSize, setTeamSize] = useState(5);
    const [slots, setSlots] = useState<SlotConstraint[]>(() =>
        Array.from({ length: 5 }, () => ({
            elements: [...ELEMENTS],
            professions: [...PROFESSIONS],
        })),
    );
    const [itemMode, setItemMode] = useState<ItemMode>('adjacent');
    const [positionFilter, setPositionFilter] = useState<Set<number>>(() => new Set());
    const [tableSlotFilters, setTableSlotFilters] =
        useState<SlotDisplayFilter[]>(() => EMPTY_SLOT_FILTERS.map((x) => ({ ...x })));
    /** Set on 「开始计算」; cleared when 组队要求 (team size / item mode / slot constraints) changes. */
    const [computedRequirementsKey, setComputedRequirementsKey] = useState<string | null>(null);

    const activeSlots = slots.slice(0, teamSize);
    const requirementsKey = useMemo(
        () => teamRequirementsKey(teamSize, itemMode, slots),
        [teamSize, itemMode, slots],
    );
    const resultsReady = computedRequirementsKey !== null && computedRequirementsKey === requirementsKey;

    const setSlotsAndInvalidate: Dispatch<SetStateAction<SlotConstraint[]>> = (action) => {
        setComputedRequirementsKey(null);
        setSlots(action);
    };

    const { validFilterPositions, comboCount, truncated, filteredRows } = useMemo(() => {
        const validFilterPositions = new Set<number>();
        for (const i of positionFilter) {
            if (i < teamSize) validFilterPositions.add(i);
        }

        if (!resultsReady) {
            return {
                validFilterPositions,
                comboCount: 0,
                truncated: false,
                filteredRows: [] as ResultRow[],
            };
        }

        const comboCount = productSizeTeam(activeSlots);
        if (comboCount > MAX_COMBINATIONS) {
            return {
                validFilterPositions,
                comboCount,
                truncated: false,
                filteredRows: [] as ResultRow[],
            };
        }

        const out: ResultRow[] = [];
        const seenAssignments = new Set<string>();
        let count = 0;
        let truncated = false;
        for (const { elements, professions } of enumerateAssignments(activeSlots)) {
            const hoe = findHoeIndex(teamSize, elements);
            const bottle = findBottleIndex(teamSize, professions);
            if (!passesItemMode(itemMode, teamSize, hoe, bottle)) continue;
            const key = assignmentKey(elements, professions);
            if (seenAssignments.has(key)) continue;
            seenAssignments.add(key);
            out.push({ elements, professions, hoe, bottle });
            count++;
            if (count > 10_000) {
                truncated = true;
                break;
            }
        }

        let filteredRows: ResultRow[];
        if (validFilterPositions.size === 0) {
            filteredRows = out;
        } else {
            filteredRows = out.filter((r) => {
                for (const pos of validFilterPositions) {
                    const hasItem =
                        (r.hoe !== null && r.hoe === pos) || (r.bottle !== null && r.bottle === pos);
                    if (hasItem) return true;
                }
                return false;
            });
        }

        filteredRows = filteredRows.filter((r) => {
            for (let si = 0; si < teamSize; si++) {
                const f = tableSlotFilters[si];
                if (!f) continue;
                if (f.element !== null && r.elements[si] !== f.element) return false;
                if (f.profession !== null && r.professions[si] !== f.profession) return false;
            }
            return true;
        });

        return { validFilterPositions, comboCount, truncated, filteredRows };
    }, [activeSlots, teamSize, itemMode, positionFilter, tableSlotFilters, resultsReady]);

    const toggleFilterPos = (i: number) => {
        setPositionFilter((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    };

    return (
        <div className="space-y-6 p-4 text-slate-800">
            <div>
                <h2 className="mb-2 text-lg font-bold text-slate-900">组队要求</h2>
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">队伍人数</span>
                        <input
                            type="number"
                            min={1}
                            max={5}
                            value={teamSize}
                            onChange={(e) => {
                                const v = Math.min(
                                    5,
                                    Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                                );
                                setComputedRequirementsKey(null);
                                setTeamSize(v);
                                setTableSlotFilters(EMPTY_SLOT_FILTERS.map((x) => ({ ...x })));
                            }}
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                        />
                    </div>
                    <SlotPickers n={teamSize} slots={slots} setSlots={setSlotsAndInvalidate} />
                    <p className="text-xs leading-relaxed text-slate-500">
                        A–E 为队员（属性/职业约束按人），遍历时会包含所有上场顺序；表内从左到右为第 1–n 号位。
                    </p>
                    <div>
                        <div className="mb-1 text-sm font-medium">道具要求</div>
                        <div
                            className="inline-flex flex-wrap gap-0 overflow-hidden rounded border border-slate-200"
                            role="radiogroup"
                        >
                            {(
                                [
                                    ['adjacent', '锄头瓶子相邻'],
                                    ['gap1', '锄头瓶子间隔1'],
                                    ['hoeOnly', '只有锄头'],
                                    ['bottleOnly', '只有瓶子'],
                                ] as const
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="radio"
                                    aria-checked={itemMode === key}
                                    onClick={() => {
                                        setComputedRequirementsKey(null);
                                        setItemMode(key);
                                    }}
                                    className={`border-l border-slate-200 px-2 py-1.5 text-xs font-medium first:border-l-0 sm:text-sm ${
                                        itemMode === key
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                            「相邻」含 1 号与 n 号；「间隔1」指环上最短步数为 2（中间隔 1 个位置）。
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        <button
                            type="button"
                            onClick={() => setComputedRequirementsKey(requirementsKey)}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                        >
                            开始计算
                        </button>
                        {!resultsReady && (
                            <span className="text-xs text-slate-500">
                                修改组队要求后需重新点击计算；下方站位表仅在计算后与当前要求一致时显示。
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div>
                <h2 className="mb-2 text-lg font-bold text-slate-900">人物站位展示表</h2>
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div>
                        <div className="mb-1 text-sm font-medium">道具可以出现的位置（多选，空则不过滤）</div>
                        <div className="inline-flex flex-wrap rounded border border-slate-200">
                            {Array.from({ length: teamSize }, (_, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => toggleFilterPos(i)}
                                    className={`border-l border-slate-200 px-2 py-1 text-xs font-medium first:border-l-0 sm:min-w-8 sm:text-sm ${
                                        validFilterPositions.has(i)
                                            ? 'bg-teal-600 text-white'
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    </div>

                    {!resultsReady && (
                        <p className="rounded border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-600">
                            请先点击上方「开始计算」，或组队要求已变更，请重新计算后查看站位表。
                        </p>
                    )}

                    {resultsReady && comboCount > MAX_COMBINATIONS && (
                        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            组合数约 {comboCount.toLocaleString()}（含上场顺序 {teamSize}! 种），超过上限{' '}
                            {MAX_COMBINATIONS.toLocaleString()} ，请为部分队员收窄属性或职业以缩小范围。
                        </p>
                    )}
                    {resultsReady && comboCount <= MAX_COMBINATIONS && truncated && (
                        <p className="text-sm text-amber-800">
                            已截断：符合条件的站位超过 10000 条，仅显示前 10000 条。
                        </p>
                    )}
                    {resultsReady && comboCount <= MAX_COMBINATIONS && !truncated && (
                        <p className="text-sm text-slate-600">
                            共 {filteredRows.length} 条
                            {validFilterPositions.size > 0 || tableSlotFilters.slice(0, teamSize).some((f) => f.element !== null || f.profession !== null)
                                ? '（已按筛选条件过滤）'
                                : ''}
                        </p>
                    )}

                    {resultsReady && comboCount <= MAX_COMBINATIONS && (
                        <div className="rounded border border-slate-200 bg-slate-50/80 px-2 py-2">
                            <div className="mb-1.5 text-xs font-medium text-slate-700">
                                按站位筛选结果（第几号位上的属性与职业；不限则不过滤该列）
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                                {Array.from({ length: teamSize }, (_, i) => (
                                    <div
                                        key={i}
                                        className="flex w-[5.25rem] flex-col gap-0.5 rounded border border-slate-200 bg-white p-1"
                                    >
                                        <span className="text-center text-[10px] font-medium text-slate-500">
                                            {i + 1} 号位
                                        </span>
                                        <label className="sr-only" htmlFor={`slot-filter-el-${i}`}>
                                            第 {i + 1} 号位属性
                                        </label>
                                        <select
                                            id={`slot-filter-el-${i}`}
                                            value={tableSlotFilters[i]?.element ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value as ElementType | '';
                                                setTableSlotFilters((prev) =>
                                                    prev.map((row, j) =>
                                                        j === i
                                                            ? {
                                                                  ...row,
                                                                  element: v === '' ? null : v,
                                                              }
                                                            : row,
                                                    ),
                                                );
                                            }}
                                            className="w-full rounded border border-slate-200 bg-white px-0.5 py-0.5 text-[11px] text-slate-800"
                                        >
                                            <option value="">属性·不限</option>
                                            {ELEMENTS.map((el) => (
                                                <option key={el} value={el}>
                                                    {el}
                                                </option>
                                            ))}
                                        </select>
                                        <label className="sr-only" htmlFor={`slot-filter-pr-${i}`}>
                                            第 {i + 1} 号位职业
                                        </label>
                                        <select
                                            id={`slot-filter-pr-${i}`}
                                            value={tableSlotFilters[i]?.profession ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value as ProfessionType | '';
                                                setTableSlotFilters((prev) =>
                                                    prev.map((row, j) =>
                                                        j === i
                                                            ? {
                                                                  ...row,
                                                                  profession: v === '' ? null : v,
                                                              }
                                                            : row,
                                                    ),
                                                );
                                            }}
                                            className="w-full rounded border border-slate-200 bg-white px-0.5 py-0.5 text-[11px] text-slate-800"
                                        >
                                            <option value="">职业·不限</option>
                                            {PROFESSIONS.map((pr) => (
                                                <option key={pr} value={pr}>
                                                    {pr}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {resultsReady && comboCount <= MAX_COMBINATIONS && filteredRows.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-sm">
                                <tbody>
                                    {filteredRows.map((r, ri) => (
                                        <tr key={ri} className="border-t border-slate-200">
                                            {r.elements.map((el, ci) => (
                                                <td
                                                    key={ci}
                                                    className="border-l border-slate-200 px-1 py-1 align-top first:border-l-0"
                                                >
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <span
                                                            className={`inline-flex items-center rounded border px-1 py-0.5 text-xs font-semibold ${ELEMENT_CLASS[el]}`}
                                                        >
                                                            {el}
                                                        </span>
                                                        <span className="text-xs text-slate-700">
                                                            {r.professions[ci]}
                                                        </span>
                                                        {r.hoe === ci && (
                                                            <span className="rounded bg-amber-100 px-0.5 text-[10px] text-amber-900">
                                                                锄
                                                            </span>
                                                        )}
                                                        {r.bottle === ci && (
                                                            <span className="rounded bg-cyan-100 px-0.5 text-[10px] text-cyan-900">
                                                                瓶
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {resultsReady && comboCount <= MAX_COMBINATIONS && filteredRows.length === 0 && (
                        <p className="text-sm text-slate-500">无符合条件的站位。</p>
                    )}
                </div>
            </div>

            <div className="rounded border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-medium text-slate-700">规则摘要</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>地→水→火→风→地；阴↔阳；混沌不参与克制判定。</li>
                    <li>
                        从左到右：若尚无锄头，第一个满足「与左右相邻位均存在克制关系」的站位得锄头；若尚无瓶子，第一个满足「与左右相邻位三者同职业」的站位得瓶子。
                    </li>
                </ul>
            </div>
        </div>
    );
}

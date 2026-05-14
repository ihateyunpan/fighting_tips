import React, { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR_ID_TO_CHAR, resolveZhuGeLabels, type ZhuGeColorId } from './zhugeResolve';

const STORAGE_KEY = 'zhuge-kpi-v1';

const COLOR_IDS = ['red', 'blue', 'yellow', 'green', 'purple'] as const;
export type ColorId = ZhuGeColorId;

const DEFAULT_ORDER: ColorId[] = [...COLOR_IDS];

function isValidColorId(x: unknown): x is ColorId {
    return typeof x === 'string' && (COLOR_IDS as readonly string[]).includes(x);
}

function normalizeOrder(raw: unknown): ColorId[] | null {
    if (!Array.isArray(raw) || raw.length !== 5) return null;
    const ids = raw.filter(isValidColorId);
    if (ids.length !== 5) return null;
    const set = new Set(ids);
    if (set.size !== 5) return null;
    return ids as ColorId[];
}

interface PersistedState {
    swordOrder: ColorId[];
    ringOrder: ColorId[];
    resultLabels: string[] | null;
    /** 预计算表中该 (剑,圈) 为 -1 */
    noSolution: boolean;
    /** 解析异常或表损坏 */
    dataReadError: boolean;
    highlightedIndex: number | null;
}

const defaultPersisted: PersistedState = {
    swordOrder: DEFAULT_ORDER,
    ringOrder: DEFAULT_ORDER,
    resultLabels: null,
    noSolution: false,
    dataReadError: false,
    highlightedIndex: null,
};

function sanitizePersisted(p: Partial<PersistedState> | null | undefined): PersistedState {
    if (!p || typeof p !== 'object') return { ...defaultPersisted };
    const sword = normalizeOrder(p.swordOrder) ?? DEFAULT_ORDER;
    const ring = normalizeOrder(p.ringOrder) ?? DEFAULT_ORDER;
    let resultLabels: string[] | null = null;
    if (Array.isArray(p.resultLabels) && p.resultLabels.every((x) => typeof x === 'string')) {
        resultLabels = [...p.resultLabels];
    }
    const noSolution = p.noSolution === true;
    const dataReadError = p.dataReadError === true;
    let highlightedIndex: number | null = null;
    if (
        typeof p.highlightedIndex === 'number' &&
        Number.isInteger(p.highlightedIndex) &&
        resultLabels &&
        p.highlightedIndex >= 0 &&
        p.highlightedIndex < resultLabels.length
    ) {
        highlightedIndex = p.highlightedIndex;
    }
    return { swordOrder: sword, ringOrder: ring, resultLabels, noSolution, dataReadError, highlightedIndex };
}

const COLOR_CLASS: Record<ColorId, string> = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-400',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
};

/** 色块上汉字对比度 */
const HAN_CLASS: Record<ColorId, string> = {
    red: 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]',
    blue: 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]',
    yellow: 'text-gray-900 font-extrabold',
    green: 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]',
    purple: 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]',
};

function useIsDraggable() {
    const [isDraggable, setIsDraggable] = useState(
        typeof window !== 'undefined' ? window.innerWidth >= 640 : true,
    );

    useEffect(() => {
        const checkDraggable = () => setIsDraggable(window.innerWidth >= 640);
        checkDraggable();
        window.addEventListener('resize', checkDraggable);
        return () => window.removeEventListener('resize', checkDraggable);
    }, []);

    return isDraggable;
}

const Panel = ({ title, children, className = '' }: {
    title: string;
    children: React.ReactNode;
    className?: string
}) => (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 ${className}`}>
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        </div>
        <div className="p-6">{children}</div>
    </div>
);

function ColorRow({
                      label,
                      order,
                      onOrderChange,
                      isDraggable,
                  }: {
    label: string;
    order: ColorId[];
    onOrderChange: (next: ColorId[]) => void;
    isDraggable: boolean;
}) {
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [swapSourceIdx, setSwapSourceIdx] = useState<number | null>(null);

    const moveIndex = useCallback(
        (fromIdx: number, toIdx: number) => {
            if (fromIdx === toIdx) return;
            const next = [...order];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            onOrderChange(next);
        },
        [order, onOrderChange],
    );

    const swapIndices = useCallback(
        (a: number, b: number) => {
            if (a === b) return;
            const next = [...order];
            const t = next[a];
            next[a] = next[b]!;
            next[b] = t!;
            onOrderChange(next);
        },
        [order, onOrderChange],
    );

    const handleDragEnd = () => {
        const from = dragItem.current;
        const to = dragOverItem.current;
        if (from !== null && to !== null) {
            moveIndex(from, to);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleBlockClick = (idx: number) => {
        if (isDraggable) return;
        if (swapSourceIdx === null) {
            setSwapSourceIdx(idx);
        } else if (swapSourceIdx === idx) {
            setSwapSourceIdx(null);
        } else {
            swapIndices(swapSourceIdx, idx);
            setSwapSourceIdx(null);
        }
    };

    return (
        <div className="mb-4 select-none">
            <div className="text-xs text-gray-500 mb-1.5 font-medium">{label}</div>
            <div className="flex gap-2 sm:gap-3 items-stretch">
                {order.map((cid, idx) => {
                    const isSwapSelected = !isDraggable && swapSourceIdx === idx;
                    const han = COLOR_ID_TO_CHAR[cid];
                    return (
                        <div
                            key={`${label}-slot-${idx}`}
                            draggable={isDraggable}
                            onDragStart={isDraggable ? () => (dragItem.current = idx) : undefined}
                            onDragEnter={isDraggable ? () => (dragOverItem.current = idx) : undefined}
                            onDragEnd={isDraggable ? handleDragEnd : undefined}
                            onDragOver={isDraggable ? (e) => e.preventDefault() : undefined}
                            onClick={() => handleBlockClick(idx)}
                            className={`
                                flex-1 min-h-[48px] rounded-lg shadow-inner border-2 transition-all
                                flex items-center justify-center
                                ${COLOR_CLASS[cid]}
                                ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                                ${isSwapSelected ? 'ring-2 ring-indigo-500 ring-offset-2 scale-[0.97]' : 'border-white/30 hover:opacity-90'}
                            `}
                            title={isDraggable ? '拖拽调整顺序' : '点两个色块交换顺序'}
                        >
                            <span
                                className={`text-base sm:text-lg font-bold tracking-wide ${HAN_CLASS[cid]}`}>{han}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function ZhuGeLiang() {
    const [persisted, setPersisted] = useState<PersistedState>(() => {
        if (typeof window === 'undefined') return defaultPersisted;
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return defaultPersisted;
        try {
            return sanitizePersisted(JSON.parse(raw) as Partial<PersistedState>);
        } catch {
            return defaultPersisted;
        }
    });

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    }, [persisted]);

    const isDraggable = useIsDraggable();

    const [isComputing, setIsComputing] = useState(false);

    const swordOrder = persisted.swordOrder;
    const ringOrder = persisted.ringOrder;
    const resultLabels = persisted.resultLabels;
    const noSolution = persisted.noSolution;
    const dataReadError = persisted.dataReadError;
    const highlightedIndex = persisted.highlightedIndex;

    const setSwordOrder = (next: ColorId[]) =>
        setPersisted((p) => ({
            ...sanitizePersisted(p),
            swordOrder: next,
            resultLabels: null,
            noSolution: false,
            dataReadError: false,
            highlightedIndex: null,
        }));
    const setRingOrder = (next: ColorId[]) =>
        setPersisted((p) => ({
            ...sanitizePersisted(p),
            ringOrder: next,
            resultLabels: null,
            noSolution: false,
            dataReadError: false,
            highlightedIndex: null,
        }));

    const handleStart = () => {
        setIsComputing(true);
        window.setTimeout(() => {
            let outcome;
            try {
                outcome = resolveZhuGeLabels(swordOrder, ringOrder);
            } catch {
                outcome = { kind: 'bad_table' as const };
            }
            setPersisted((p) => {
                const base = { ...sanitizePersisted(p), swordOrder, ringOrder };
                if (outcome.kind === 'ok') {
                    return {
                        ...base,
                        resultLabels: outcome.labels,
                        noSolution: false,
                        dataReadError: false,
                        highlightedIndex: null,
                    };
                }
                if (outcome.kind === 'no_solution') {
                    return {
                        ...base,
                        resultLabels: null,
                        noSolution: true,
                        dataReadError: false,
                        highlightedIndex: null,
                    };
                }
                return {
                    ...base,
                    resultLabels: null,
                    noSolution: false,
                    dataReadError: true,
                    highlightedIndex: null,
                };
            });
            setIsComputing(false);
        }, 120);
    };

    const toggleHighlight = (idx: number) => {
        setPersisted((p) => {
            const base = sanitizePersisted(p);
            if (!base.resultLabels || idx < 0 || idx >= base.resultLabels.length) return base;
            return {
                ...base,
                highlightedIndex: base.highlightedIndex === idx ? null : idx,
            };
        });
    };

    const showHint =
        !isComputing && !noSolution && !dataReadError && resultLabels === null;
    const showEqual =
        !isComputing && !noSolution && !dataReadError && resultLabels !== null && resultLabels.length === 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 p-2 md:p-4">
            <Panel title="诸葛亮" className="border-indigo-100">
                <p className="text-xs text-gray-500 mb-4">
                    {isDraggable ? '拖拽色块调整顺序' : '依次点击两个色块以交换顺序'}
                </p>

                <ColorRow label="剑（上方）" order={swordOrder} onOrderChange={setSwordOrder} isDraggable={isDraggable}/>
                <ColorRow label="圈（下方）" order={ringOrder} onOrderChange={setRingOrder} isDraggable={isDraggable}/>

                <div className="flex justify-center py-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={isComputing}
                        className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                        开始计算
                    </button>
                </div>

                <div className="min-h-[3.5rem] border-t border-gray-100 pt-4">
                    {isComputing && (
                        <div className="flex flex-col items-center justify-center gap-3 py-2">
                            <div
                                className="size-9 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin"
                                aria-hidden
                            />
                            <span className="text-sm text-gray-500">计算中…</span>
                        </div>
                    )}
                    {!isComputing && resultLabels && resultLabels.length > 0 && (
                        <div className="space-y-4">
                            <div
                                className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/90 px-4 py-3.5 shadow-sm ring-1 ring-amber-100/60"
                                role="note"
                            >
                                <p className="text-base sm:text-[1.05rem] leading-relaxed text-amber-950/90 text-center sm:text-left">
                                    <span className="mr-1.5" aria-hidden>
                                        💡
                                    </span>
                                    <span className="font-mono font-bold tracking-tight text-amber-900">【2A】</span>
                                    <span className="mx-1 text-amber-800/80">=</span>
                                    <span className="font-semibold text-amber-950/85">
                                        <span
                                            className="rounded-md bg-amber-300/95 px-1.5 py-0.5 text-amber-950 shadow-sm ring-1 ring-amber-400/70">
                                            2号位
                                        </span>
                                        <span className="font-mono font-bold">A</span>
                                    </span>
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                                {resultLabels.map((text, idx) => {
                                    const active = highlightedIndex === idx;
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => toggleHighlight(idx)}
                                            className={`
                                            px-3 py-2 rounded-full text-sm font-mono font-bold border-2 transition-all
                                            ${
                                                active
                                                    ? 'z-10 scale-110 bg-amber-300 text-amber-950 border-amber-600 ring-4 ring-amber-400/80 shadow-lg shadow-amber-500/30'
                                                    : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300'
                                            }
                                        `}
                                        >
                                            {text}
                                        </button>
                                    );
                                })}
                            </div>
                            <div
                                className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/40 px-4 py-3.5 shadow-sm ring-1 ring-slate-100"
                                role="note"
                            >
                                <p className="text-sm sm:text-base leading-relaxed text-slate-700 text-center sm:text-left">
                                    <span className="block">⏱ 操作完毕后，触发<span className="font-semibold text-indigo-800 tabular-nums">20</span>秒倒计时</span>
                                    <span className="block mt-2 text-xs sm:text-sm text-slate-500 leading-normal">
                                        ⚠️在此期间可以：①奶无限次行动奶人，②dot无限次行动叠层，③乐器密探无限次行动叠正音……
                                    </span>
                                    <span className="block mt-2">直到诸葛亮身上有<span className="font-semibold text-yellow-500 tabular-nums">黄色时钟</span>，再正常输出诸葛亮</span>
                                </p>
                            </div>
                        </div>
                    )}
                    {!isComputing && showEqual && (
                        <p className="text-center text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-3 px-4">
                            上下方颜色排列已一致，无需操作
                        </p>
                    )}
                    {!isComputing && dataReadError && (
                        <p className="text-center text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg py-3 px-4">
                            无法读取或校验 answer.json 数据
                        </p>
                    )}
                    {!isComputing && noSolution && !dataReadError && (
                        <p className="text-center text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg py-3 px-4">
                            该排列在预计算表中无解
                        </p>
                    )}
                    {!isComputing && showHint && (
                        <p className="text-center text-sm text-gray-400">点击「开始计算」后在此显示结果</p>
                    )}
                </div>
            </Panel>
        </div>
    );
}

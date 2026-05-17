import { ArrowRightLeft, ChevronDown, ChevronRight, Copy, Plus, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLevelToolbar } from '../../../components/LevelContext';
import {
    type ActionItem,
    type ActionSlot,
    type ActionType,
    canPlaceActionInPath,
    type ElementType,
    evaluateGroupMatch,
    evaluateOperationMatch,
    getActionLabel,
    normalizeOperationRequirementData,
    type OperationRequirementData,
    OperationRequirementPanel,
    type OperationSequence,
    toOperationSequence
} from '../../../components/OperationRequirementPanel';

// --- 类型定义（荀攸考核） ---
type CoreElement = '地' | '水' | '火' | '风';
type PermChar = CoreElement | '空';
type ColorChoice = CoreElement | '空白';

interface HitRecord {
    skillEnabled: boolean;
    hitOrder: (number | null)[];
}

interface Round {
    id: string;
    name?: string;
    /** @deprecated 旧版单操作组数据，导入时自动迁移到 operationRequirements */
    actions?: ActionItem[];
    operationRequirements?: OperationRequirementData;
    isCollapsed?: boolean;
    requireAdjacentDifferent?: boolean;
    requireAttributeOrder?: boolean;
    hitRecord: HitRecord;
    currentColors: ColorChoice[];
}

type Slot = ActionSlot;

interface PlanRow {
    orderKey: string;
    order: PermChar[];
    solution: OperationSequence | null;
}

type BasicActionType = 'A' | '↑' | '↓';

const isCircleAction = (action: ActionItem) => action.types.includes('圈');

const getBasicTypes = (action: ActionItem): BasicActionType[] =>
    action.types.filter((t): t is BasicActionType => t === 'A' || t === '↑' || t === '↓');

const getPrevNonCircleType = (
    path: ActionItem[],
    resolvedTypes: Map<string, ActionType>
): ActionType | null => {
    for (let i = path.length - 1; i >= 0; i--) {
        const action = path[i];
        if (isCircleAction(action)) continue;
        return resolvedTypes.get(action.id) ?? null;
    }
    return null;
};

// --- 常量 ---
const STORAGE_SLOTS_KEY = 'xunyou-slots-v1';
const STORAGE_ROUNDS_KEY = 'xunyou-rounds-v1';
const CORE_ELEMENTS: CoreElement[] = ['地', '水', '火', '风'];
const COLOR_CHOICES: ColorChoice[] = ['地', '水', '火', '风', '空白'];

const DEFAULT_HIT_RECORD: HitRecord = {
    skillEnabled: false,
    hitOrder: [null, null, null, null, null]
};
const DEFAULT_CURRENT_COLORS: ColorChoice[] = ['空白', '空白', '空白', '空白', '空白'];

const ELEMENTS: Record<ElementType, { bg: string; text: string; lightBg: string; border: string }> = {
    '地': { bg: 'bg-amber-800', text: 'text-amber-100', lightBg: 'bg-amber-50', border: 'border-amber-200' },
    '水': { bg: 'bg-blue-500', text: 'text-blue-50', lightBg: 'bg-blue-50', border: 'border-blue-200' },
    '火': { bg: 'bg-red-500', text: 'text-red-50', lightBg: 'bg-red-50', border: 'border-red-200' },
    '风': { bg: 'bg-emerald-500', text: 'text-emerald-50', lightBg: 'bg-emerald-50', border: 'border-emerald-200' },
    '阴': { bg: 'bg-purple-600', text: 'text-purple-50', lightBg: 'bg-purple-50', border: 'border-purple-200' },
    '阳': { bg: 'bg-yellow-400', text: 'text-yellow-900', lightBg: 'bg-yellow-50', border: 'border-yellow-200' },
    '混沌': { bg: 'bg-slate-600', text: 'text-slate-100', lightBg: 'bg-slate-100', border: 'border-slate-200' }
};

const COLOR_BUTTON_STYLES: Record<ColorChoice, string> = {
    '地': `${ELEMENTS['地'].bg} ${ELEMENTS['地'].text}`,
    '水': `${ELEMENTS['水'].bg} ${ELEMENTS['水'].text}`,
    '火': `${ELEMENTS['火'].bg} ${ELEMENTS['火'].text}`,
    '风': `${ELEMENTS['风'].bg} ${ELEMENTS['风'].text}`,
    '空白': 'bg-white text-slate-500 border border-slate-200'
};

// --- Hook: 持久化 ---
function useStickyState<T>(defaultValue: T, key: string): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [value, setValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    });
    useEffect(() => {
        window.localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);
    return [value, setValue];
}

// --- Helper Functions ---
const generateId = () => Math.random().toString(36).substr(2, 9);

const getSlotContent = (resolved: OperationSequence | null) => {
    const slotContents: string[] = Array(5).fill('');
    if (!resolved) return slotContents;

    const { path, resolvedTypes } = resolved;
    path.forEach((act, sequenceIndex) => {
        const chosen = resolvedTypes.get(act.id);
        if (!chosen) return;

        let prefix = '';
        if (!isCircleAction(act)) {
            const effectiveIndex = path
                .slice(0, sequenceIndex + 1)
                .filter(a => !isCircleAction(a))
                .length;
            prefix = `${effectiveIndex}`;
        }

        const content = `${prefix}${getActionLabel([chosen])}`;
        slotContents[act.slotIndex] = slotContents[act.slotIndex]
            ? `${slotContents[act.slotIndex]} ${content}`
            : content;
    });

    return slotContents;
};

const permute = <T, >(arr: T[]): T[][] => {
    if (arr.length <= 1) return [arr];
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const p of permute(rest)) result.push([arr[i], ...p]);
    }
    return result;
};

const getPermutationBasis = (useFive: boolean): PermChar[] =>
    useFive ? ['地', '水', '火', '风', '空'] : ['地', '水', '火', '风'];

const orderToKey = (order: PermChar[]) => order.join('');

const colorChoiceToPermChar = (c: ColorChoice): PermChar => (c === '空白' ? '空' : c);

const buildExpectedOrderKey = (
    currentColors: ColorChoice[],
    hitOrder: (number | null)[]
): string | null => {
    const pairs: { num: number; char: PermChar }[] = [];
    for (let i = 0; i < 5; i++) {
        const num = hitOrder[i];
        if (num != null) pairs.push({ num, char: colorChoiceToPermChar(currentColors[i]) });
    }
    if (pairs.length === 0) return null;
    pairs.sort((a, b) => a.num - b.num);
    return pairs.map(p => p.char).join('');
};

const FIRST_ROUND_NAME = '回合1';

const defaultRoundName = (index: number) =>
    index === 0 ? FIRST_ROUND_NAME : `第 ${index + 1} 回合`;

const getRoundDisplayName = (round: Round, index: number) => {
    const trimmed = round.name?.trim();
    return trimmed ? trimmed : defaultRoundName(index);
};

const validateHitOrder = (hitOrder: (number | null)[], skillEnabled: boolean): string | null => {
    const required = skillEnabled ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
    const used = hitOrder.filter((n): n is number => n != null);
    const usedSet = new Set(used);
    const missing = required.filter(n => !usedSet.has(n));
    const extra = used.filter(n => !required.includes(n));
    if (missing.length > 0 || extra.length > 0 || usedSet.size !== required.length) {
        return skillEnabled
            ? '挨打顺序须包含 1、2、3、4、5 各一个'
            : '挨打顺序须包含 1、2、3、4 各一个';
    }
    return null;
};

const BET_TAG_BASE = 'text-xs px-2 py-0.5 rounded-full font-bold';

const getBetTag = (feasibleCount: number, skillEnabled: boolean): { label: string; className: string } => {
    const denominator = skillEnabled ? 120 : 24;
    const pct = Math.round((feasibleCount / denominator) * 100);
    if (pct >= 100) {
        return { label: '不赌', className: `${BET_TAG_BASE} bg-green-100 text-green-700` };
    }
    return { label: `赌${pct}%`, className: `${BET_TAG_BASE} bg-amber-100 text-amber-700` };
};

const colorChoiceLabel = (c: ColorChoice) => (c === '空白' ? '—' : c);

type AttributeOrderBadge = {
    value: string;
    style: 'element' | 'empty' | 'disabled';
    element?: CoreElement;
};

const buildCurrentAttributeOrderBadges = (
    currentColors: ColorChoice[],
    hitOrder: (number | null)[]
): AttributeOrderBadge[] => {
    const hasFive = hitOrder.some(n => n === 5);
    const badges: AttributeOrderBadge[] = [];

    for (let i = 1; i <= 5; i++) {
        const slotIdx = hitOrder.findIndex(n => n === i);
        if (slotIdx === -1) {
            badges.push({ value: '-', style: 'disabled' });
            continue;
        }
        const color = currentColors[slotIdx];
        if (color === '空白') {
            badges.push(
                hasFive ? { value: '空', style: 'empty' } : { value: '-', style: 'disabled' }
            );
        } else {
            badges.push({ value: color, style: 'element', element: color });
        }
    }
    return badges;
};

const ATTRIBUTE_ORDER_TAG_BASE =
    'inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full text-[11px] font-bold leading-none border';

const ATTRIBUTE_ORDER_TAG_STYLES: Record<CoreElement, string> = {
    '地': 'bg-amber-100 text-amber-800 border-amber-200',
    '水': 'bg-blue-100 text-blue-700 border-blue-200',
    '火': 'bg-red-100 text-red-700 border-red-200',
    '风': 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

const attributeOrderBadgeClass = (badge: AttributeOrderBadge): string => {
    if (badge.style === 'element' && badge.element) {
        return `${ATTRIBUTE_ORDER_TAG_BASE} ${ATTRIBUTE_ORDER_TAG_STYLES[badge.element]}`;
    }
    if (badge.style === 'empty') {
        return `${ATTRIBUTE_ORDER_TAG_BASE} bg-white text-slate-600 border-slate-200`;
    }
    return `${ATTRIBUTE_ORDER_TAG_BASE} bg-slate-50 text-slate-300 border-slate-100`;
};

const pathMatchesAttributeOrder = (
    path: readonly ActionItem[],
    slots: Slot[],
    order: PermChar[]
): boolean => {
    if (path.length < order.length) return false;
    for (let i = 0; i < order.length; i++) {
        const required = order[i];
        if (required === '空') continue;
        const slotEl = slots[path[i].slotIndex].element;
        if (slotEl !== required) return false;
    }
    return true;
};

const hasAllCoreElements = (slots: Slot[]) =>
    CORE_ELEMENTS.every(el => slots.some(s => s.element === el));

const createDefaultRound = (index: number): Round => ({
    id: generateId(),
    name: defaultRoundName(index),
    operationRequirements: { groups: [] },
    actions: [],
    requireAdjacentDifferent: true,
    requireAttributeOrder: true,
    hitRecord: { skillEnabled: false, hitOrder: [null, null, null, null, null] },
    currentColors: [...DEFAULT_CURRENT_COLORS]
});

const getRoundOperationRequirements = (round: Round): OperationRequirementData =>
    normalizeOperationRequirementData(round.operationRequirements, round.actions);

const copyToClipboard = (rows: string[][]) => {
    const text = rows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        // 可选：添加简单的 Toast 或 Alert 反馈
        alert("已复制到剪贴板");
    }).catch(err => {
        console.error('复制失败:', err);
    });
};

// --- 核心算法（1.1 相邻约束；1.3 操作要求由 operationMatch 判定） ---
const solveGroupPaths = (
    groupActions: ActionItem[],
    requireAdjacentDifferent: boolean
): OperationSequence[] => {
    if (groupActions.length < 5) return [];

    const allPaths: OperationSequence[] = [];
    const totalSteps = groupActions.length;
    const stubGroup = { id: '', actions: groupActions };

    const dfs = (
        path: ActionItem[],
        resolvedTypes: Map<string, ActionType>,
        used: Set<string>
    ) => {
        if (path.length === totalSteps) {
            const sequence = toOperationSequence(path, resolvedTypes);
            if (evaluateGroupMatch(stubGroup, sequence).hardMet) {
                allPaths.push(sequence);
            }
            return;
        }

        const prevNonCircleType = getPrevNonCircleType(path, resolvedTypes);

        for (const action of groupActions) {
            if (used.has(action.id)) continue;
            if (!canPlaceActionInPath(path, action, groupActions)) continue;

            used.add(action.id);
            path.push(action);

            if (isCircleAction(action)) {
                resolvedTypes.set(action.id, '圈');
                dfs(path, resolvedTypes, used);
                resolvedTypes.delete(action.id);
            } else {
                for (const type of getBasicTypes(action)) {
                    if (requireAdjacentDifferent && prevNonCircleType !== null && type === prevNonCircleType) {
                        continue;
                    }
                    resolvedTypes.set(action.id, type);
                    dfs(path, resolvedTypes, used);
                    resolvedTypes.delete(action.id);
                }
            }

            path.pop();
            used.delete(action.id);
        }
    };

    dfs([], new Map(), new Set());
    return allPaths;
};

const solveOperationPaths = (
    operationData: OperationRequirementData,
    requireAdjacentDifferent = true
): { paths: OperationSequence[]; error: string | null } => {
    if (operationData.groups.length === 0) {
        return { paths: [], error: '需5个操作' };
    }

    const allPaths: OperationSequence[] = [];
    for (const group of operationData.groups) {
        allPaths.push(...solveGroupPaths(group.actions, requireAdjacentDifferent));
    }

    return {
        paths: allPaths,
        error: allPaths.length === 0 ? '无解 (冲突)' : null
    };
};

const buildPlanRows = (
    paths: OperationSequence[],
    operationRequirements: OperationRequirementData,
    slots: Slot[],
    useFive: boolean,
    requireAttributeOrder = true
): PlanRow[] => {
    const basis = getPermutationBasis(useFive);
    return permute(basis).map(order => {
        const orderKey = orderToKey(order);
        const matching = requireAttributeOrder
            ? paths.filter(p => pathMatchesAttributeOrder(p.path, slots, order))
            : paths;
        let solution: OperationSequence | null = null;
        if (matching.length > 0) {
            solution = matching.reduce((best, cur) =>
                evaluateOperationMatch(operationRequirements, cur).softScore >
                evaluateOperationMatch(operationRequirements, best).softScore ? cur : best
            );
        }
        return { orderKey, order, solution };
    });
};

// --- 组件定义 ---
const ElementSelector = ({ current, onChange }: { current: ElementType; onChange: (e: ElementType) => void; }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    return (
        <div className="relative w-full z-20" ref={containerRef}>
            <button onClick={() => setIsOpen(!isOpen)}
                    className={`w-full py-2 px-3 rounded-lg font-bold text-sm shadow-sm flex justify-between items-center transition-all ${ELEMENTS[current].bg} ${ELEMENTS[current].text}`}>
                <span>{current}</span><span className="opacity-70 text-xs">▼</span>
            </button>
            {isOpen && (
                <div
                    className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden p-1 grid grid-cols-1 gap-0.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                    {(Object.keys(ELEMENTS) as ElementType[]).map((el) => (
                        <button key={el} onClick={() => {
                            onChange(el);
                            setIsOpen(false);
                        }}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium flex items-center gap-2 ${ELEMENTS[el].bg} ${ELEMENTS[el].text}`}>
                            <span className="w-2 h-2 rounded-full bg-current opacity-50"/>{el}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const ROUND_PANEL_LABEL_CLASS = 'text-xs font-bold text-slate-500 w-36 shrink-0 whitespace-nowrap';

const ConstraintToggleButton = ({
                                    label,
                                    active,
                                    onClick,
                                    title
                                }: {
    label: string;
    active: boolean;
    onClick: () => void;
    title: string;
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className={`px-2.5 py-1 text-xs font-bold rounded border transition-colors ${
            active
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
        }`}
    >
        {label}
    </button>
);

const PrevRoundLabel = ({ children }: { children: React.ReactNode }) => (
    <span className={ROUND_PANEL_LABEL_CLASS}>
        <span className="text-indigo-600 font-extrabold">（上回合）</span>
        {children}
    </span>
);

const ColorDropdownButton = ({
                                 color,
                                 onSelect
                             }: {
    color: ColorChoice;
    onSelect: (c: ColorChoice) => void;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    return (
        <div className="relative flex-1" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`w-full h-9 rounded border text-sm font-bold transition-all ${COLOR_BUTTON_STYLES[color]}`}
            >
                {colorChoiceLabel(color)}
            </button>
            {open && (
                <div
                    className="absolute top-full left-0 mt-1 z-40 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden p-1 flex flex-col gap-0.5">
                    {COLOR_CHOICES.map(choice => (
                        <button
                            key={choice}
                            type="button"
                            onClick={() => {
                                onSelect(choice);
                                setOpen(false);
                            }}
                            className={`w-full py-1.5 rounded text-xs font-bold ${COLOR_BUTTON_STYLES[choice]}`}
                        >
                            {choice}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const RoundColorPanel = ({
                             hitRecord,
                             currentColors,
                             onHitRecordChange,
                             onColorsChange
                         }: {
    hitRecord: HitRecord;
    currentColors: ColorChoice[];
    onHitRecordChange: (hr: HitRecord) => void;
    onColorsChange: (colors: ColorChoice[]) => void;
}) => {
    const maxNum = hitRecord.skillEnabled ? 5 : 4;
    const hitOrderWarning = validateHitOrder(hitRecord.hitOrder, hitRecord.skillEnabled);
    const attributeOrderBadges = useMemo(
        () => buildCurrentAttributeOrderBadges(currentColors, hitRecord.hitOrder),
        [currentColors, hitRecord.hitOrder]
    );

    const toggleHitButton = (idx: number) => {
        const next = [...hitRecord.hitOrder];
        if (next[idx] != null) {
            next[idx] = null;
        } else {
            const used = new Set(next.filter((n): n is number => n != null));
            const available = Array.from({ length: maxNum }, (_, i) => i + 1).filter(n => !used.has(n));
            if (available.length === 0) return;
            next[idx] = Math.min(...available);
        }
        onHitRecordChange({ ...hitRecord, hitOrder: next });
    };

    const resetHitOrder = () =>
        onHitRecordChange({ ...hitRecord, hitOrder: [null, null, null, null, null] });

    return (
        <div className="mb-4 space-y-3">
            <div className="flex items-center gap-3">
                <PrevRoundLabel>荀攸技能？</PrevRoundLabel>
                <button
                    type="button"
                    onClick={() =>
                        onHitRecordChange({
                            skillEnabled: !hitRecord.skillEnabled,
                            hitOrder: [null, null, null, null, null]
                        })
                    }
                    className={`relative w-11 h-6 rounded-full transition-colors ${hitRecord.skillEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                    <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${hitRecord.skillEnabled ? 'translate-x-5' : ''}`}
                    />
                </button>
                <span className="text-xs text-slate-400">{hitRecord.skillEnabled ? '是' : '否'}</span>
            </div>

            <div>
                <div className="flex items-center gap-3">
                    <PrevRoundLabel>挨打顺序</PrevRoundLabel>
                    <div className="flex gap-2 flex-1">
                        {hitRecord.hitOrder.map((num, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => toggleHitButton(idx)}
                                className={`flex-1 h-9 rounded border text-sm font-bold transition-all ${
                                    num != null
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300'
                                }`}
                            >
                                {num ?? ''}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={resetHitOrder}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded"
                        title="重置"
                    >
                        <RotateCcw size={16}/>
                    </button>
                </div>
                {hitOrderWarning && (
                    <p className="mt-1 ml-36 text-[10px] text-amber-700">{hitOrderWarning}</p>
                )}
            </div>

            <div className="flex items-center gap-3">
                <span className={ROUND_PANEL_LABEL_CLASS}>当前颜色</span>
                <div className="flex gap-2 flex-1">
                    {currentColors.map((color, idx) => (
                        <ColorDropdownButton
                            key={idx}
                            color={color}
                            onSelect={c => {
                                const next = [...currentColors];
                                next[idx] = c;
                                onColorsChange(next);
                            }}
                        />
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3">
                <span className={ROUND_PANEL_LABEL_CLASS}>当前属性顺序</span>
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    {attributeOrderBadges.map((badge, idx) => (
                        <span key={idx} className={attributeOrderBadgeClass(badge)}>
                            {badge.value}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ActionPlanTable = ({
                             rows,
                             slots,
                             expectedOrderKey,
                             error,
                             requireAttributeOrder
                         }: {
    rows: PlanRow[];
    slots: Slot[];
    expectedOrderKey: string | null;
    error: string | null;
    requireAttributeOrder: boolean;
}) => {
    const [showAll, setShowAll] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const effectiveSelected = selectedKey ?? expectedOrderKey;

    const feasibleRows = useMemo(() => rows.filter(r => r.solution != null), [rows]);

    const displayRows = useMemo(() => {
        if (showAll || !requireAttributeOrder) return feasibleRows;
        if (!expectedOrderKey) return [];
        return feasibleRows.filter(r => r.orderKey === expectedOrderKey);
    }, [feasibleRows, showAll, expectedOrderKey, requireAttributeOrder]);

    const handleCopyAll = () => {
        const allRows = feasibleRows.map(r => [r.orderKey, ...getSlotContent(r.solution)]);
        if (allRows.length > 0) copyToClipboard(allRows);
    };

    const getRow = (row: PlanRow) => {
        const isSelected = effectiveSelected === row.orderKey;
        const slotContents = getSlotContent(row.solution);
        const feasible = row.solution != null;
        return (
            <tr
                key={row.orderKey}
                onClick={() => feasible && setSelectedKey(isSelected ? null : row.orderKey)}
                className={`transition-all border-b border-slate-50 last:border-0 ${
                    feasible ? 'cursor-pointer' : 'opacity-40 grayscale hover:grayscale-0'
                }`}
            >
                <td
                    className={`p-3 font-medium border-r border-slate-100 font-mono tracking-wide ${
                        isSelected ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-800'
                    }`}
                >
                    {row.orderKey}
                </td>
                {slots.map((s, idx) => (
                    <td
                        key={idx}
                        className={`p-3 border-r border-white font-mono font-bold ${
                            isSelected ? 'bg-indigo-50 text-indigo-900' : `${ELEMENTS[s.element].lightBg} text-slate-600`
                        }`}
                    >
                        {feasible ? (
                            slotContents[idx] || <span className="opacity-30 font-normal">-</span>
                        ) : (
                            '-'
                        )}
                    </td>
                ))}
                <td className="p-3 text-center">
                    {feasible && (
                        <button
                            type="button"
                            onClick={e => {
                                e.stopPropagation();
                                copyToClipboard([[row.orderKey, ...slotContents]]);
                            }}
                            className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-slate-100"
                        >
                            <Copy size={14}/>
                        </button>
                    )}
                </td>
            </tr>
        );
    };

    return (
        <div className="border-t border-slate-100 pt-4">
            <div className="flex justify-between items-end mb-2">
                <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="px-2 py-1 text-xs font-medium rounded border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                >
                    →{showAll ? '只显示符合要求' : '全量显示'}
                </button>
                <button
                    type="button"
                    onClick={handleCopyAll}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors"
                >
                    <Copy size={12}/> 复制所有可能性
                </button>
            </div>
            {error ? (
                <div className="text-xs text-red-500 font-bold flex items-center gap-1 bg-red-50 p-2 rounded">
                    <Settings2 size={12}/> {error}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-3 w-1/6">属性顺序</th>
                            {slots.map(s => (
                                <th
                                    key={s.index}
                                    className={`p-3 w-1/6 ${ELEMENTS[s.element].lightBg} text-slate-700 border-l border-white`}
                                >
                                    {s.index + 1}号位{' '}
                                    <span className="opacity-50 font-normal">({s.element})</span>
                                </th>
                            ))}
                            <th className="p-3 w-10"/>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">{displayRows.map(getRow)}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const RoundComponent = ({
                            round,
                            slots,
                            index,
                            onUpdate,
                            onToggleCollapse,
                            onDelete,
                            onClone,
                            contentRef
                        }: {
    round: Round;
    slots: Slot[];
    index: number;
    onUpdate: (r: Round) => void;
    onToggleCollapse: () => void;
    onDelete: () => void;
    onClone: () => void;
    contentRef?: (el: HTMLDivElement | null) => void;
}) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const titleInputRef = useRef<HTMLInputElement>(null);

    const hitRecord = round.hitRecord ?? DEFAULT_HIT_RECORD;
    const displayName = getRoundDisplayName(round, index);
    const currentColors = round.currentColors ?? DEFAULT_CURRENT_COLORS;
    const useFive = hitRecord.skillEnabled;
    const requireAdjacentDifferent = round.requireAdjacentDifferent ?? true;
    const requireAttributeOrder = round.requireAttributeOrder ?? true;
    const operationRequirements = useMemo(
        () => getRoundOperationRequirements(round),
        [round]
    );
    const slotBorderClasses = useMemo(
        () => Object.fromEntries(slots.map(s => [s.index, ELEMENTS[s.element].border])),
        [slots]
    );

    const { paths, error } = useMemo(
        () => solveOperationPaths(operationRequirements, requireAdjacentDifferent),
        [operationRequirements, requireAdjacentDifferent]
    );
    const planRows = useMemo(
        () => buildPlanRows(paths, operationRequirements, slots, useFive, requireAttributeOrder),
        [paths, operationRequirements, slots, useFive, requireAttributeOrder]
    );
    const feasibleCount = useMemo(() => planRows.filter(r => r.solution != null).length, [planRows]);
    const betTag = useMemo(
        () => getBetTag(feasibleCount, hitRecord.skillEnabled),
        [feasibleCount, hitRecord.skillEnabled]
    );
    const expectedOrderKey = useMemo(
        () => buildExpectedOrderKey(currentColors, hitRecord.hitOrder),
        [currentColors, hitRecord.hitOrder]
    );

    useEffect(() => {
        if (isEditingTitle) titleInputRef.current?.focus();
    }, [isEditingTitle]);

    const commitTitle = () => {
        const trimmed = titleDraft.trim();
        onUpdate({ ...round, name: trimmed || undefined });
        setIsEditingTitle(false);
    };

    const cancelTitleEdit = () => {
        setTitleDraft(displayName);
        setIsEditingTitle(false);
    };

    const updateOperationRequirements = (value: OperationRequirementData) =>
        onUpdate({
            ...round,
            operationRequirements: value,
            actions: value.groups[0]?.actions ?? []
        });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <button onClick={onToggleCollapse}
                            className="text-slate-400 hover:text-slate-600">
                        {round.isCollapsed ? <ChevronRight size={18}/> : <ChevronDown size={18}/>}
                    </button>
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            value={titleDraft}
                            onChange={e => setTitleDraft(e.target.value)}
                            onBlur={commitTitle}
                            onKeyDown={e => {
                                e.stopPropagation();
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitTitle();
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelTitleEdit();
                                }
                            }}
                            onClick={e => e.stopPropagation()}
                            className="font-bold text-slate-700 bg-white border border-indigo-300 rounded px-2 py-0.5 text-sm min-w-[6rem] max-w-[12rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                    ) : (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={e => {
                                e.stopPropagation();
                                setTitleDraft(displayName);
                                setIsEditingTitle(true);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTitleDraft(displayName);
                                    setIsEditingTitle(true);
                                }
                            }}
                            className="font-bold text-slate-700 cursor-text hover:text-indigo-600 rounded px-1 -mx-1"
                            title="点击编辑名称"
                        >
                            {displayName}
                        </span>
                    )}
                    <span className={betTag.className}>{betTag.label}</span>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1.5">
                        <ConstraintToggleButton
                            label="相邻"
                            active={requireAdjacentDifferent}
                            onClick={() =>
                                onUpdate({
                                    ...round,
                                    requireAdjacentDifferent: !requireAdjacentDifferent
                                })
                            }
                            title="激活：相邻两次非圈操作必须不同"
                        />
                        <ConstraintToggleButton
                            label="属性"
                            active={requireAttributeOrder}
                            onClick={() =>
                                onUpdate({
                                    ...round,
                                    requireAttributeOrder: !requireAttributeOrder
                                })
                            }
                            title="激活：操作顺序按属性顺序要求，并显示颜色面板"
                        />
                    </div>
                    <button onClick={onClone}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Copy
                        size={16}/></button>
                    <button onClick={onDelete}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2
                        size={16}/></button>
                </div>
            </div>

            {!round.isCollapsed && (
                <div ref={contentRef} className="p-4 scroll-mt-28">
                    <OperationRequirementPanel
                        value={operationRequirements}
                        onChange={updateOperationRequirements}
                        slots={slots}
                        slotBorderClasses={slotBorderClasses}
                    />

                    {requireAttributeOrder && (
                        <RoundColorPanel
                            hitRecord={hitRecord}
                            currentColors={currentColors}
                            onHitRecordChange={hr => onUpdate({ ...round, hitRecord: hr })}
                            onColorsChange={colors => onUpdate({ ...round, currentColors: colors })}
                        />
                    )}
                    <ActionPlanTable
                        rows={planRows}
                        slots={slots}
                        expectedOrderKey={expectedOrderKey}
                        error={error}
                        requireAttributeOrder={requireAttributeOrder}
                    />
                </div>
            )}
        </div>
    );
};

const withOnlyExpanded = (rounds: Round[], activeIndex: number): Round[] =>
    rounds.map((r, i) => ({
        ...r,
        isCollapsed: i !== activeIndex
    }));

const normalizeRound = (raw: Partial<Round> & { id: string; ignoreMechanics?: boolean }): Round => {
    const legacyIgnore = raw.ignoreMechanics === true;
    const defaultConstraints = legacyIgnore ? false : true;
    const legacyActions = (raw.actions ?? []).map(a => ({
        ...a,
        preferences: a.preferences ?? [],
        relativeRules: a.relativeRules ?? []
    }));
    const operationRequirements = normalizeOperationRequirementData(
        raw.operationRequirements,
        legacyActions
    );
    return {
        id: raw.id,
        operationRequirements,
        actions: operationRequirements.groups[0]?.actions ?? [],
        isCollapsed: raw.isCollapsed,
        name: raw.name,
        requireAdjacentDifferent: raw.requireAdjacentDifferent ?? defaultConstraints,
        requireAttributeOrder: raw.requireAttributeOrder ?? defaultConstraints,
        hitRecord: raw.hitRecord ?? { skillEnabled: false, hitOrder: [null, null, null, null, null] },
        currentColors: raw.currentColors ?? [...DEFAULT_CURRENT_COLORS]
    };
};

// --- 主应用组件（荀攸考核） ---
export default function XunYouKpi() {
    const [slots, setSlots] = useStickyState<Slot[]>(Array.from({ length: 5 }, (_, i) => ({
        index: i,
        element: '地'
    })), STORAGE_SLOTS_KEY);
    const [rounds, setRounds] = useStickyState<Round[]>([createDefaultRound(0)], STORAGE_ROUNDS_KEY);
    const [history, setHistory] = useState<Round[][]>([]);
    const pendingScrollRoundId = useRef<string | null>(null);
    const roundContentRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const pushHistory = (newRounds: Round[]) => setHistory(prev => [...prev, newRounds].slice(-10));
    const updateRounds = (newRounds: Round[]) => {
        pushHistory(rounds);
        setRounds(newRounds);
    };
    const handleUndo = () => {
        if (history.length) {
            setRounds(history[history.length - 1]);
            setHistory(prev => prev.slice(0, -1));
        }
    };

    useEffect(() => {
        const id = pendingScrollRoundId.current;
        if (!id) return;
        const tryScroll = (attemptsLeft: number) => {
            const el = roundContentRefs.current[id];
            if (el) {
                pendingScrollRoundId.current = null;
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            if (attemptsLeft > 0) requestAnimationFrame(() => tryScroll(attemptsLeft - 1));
        };
        requestAnimationFrame(() => tryScroll(5));
    }, [rounds]);

    const addRound = () => {
        const newIndex = rounds.length;
        const newRound = createDefaultRound(newIndex);
        pendingScrollRoundId.current = newRound.id;
        updateRounds(withOnlyExpanded([...rounds, newRound], newIndex));
    };
    const updateRound = (updated: Round) => {
        updateRounds(rounds.map(r => (r.id === updated.id ? updated : r)));
    };
    const toggleRoundCollapse = (roundId: string) => {
        const idx = rounds.findIndex(r => r.id === roundId);
        if (idx === -1) return;
        if (!rounds[idx].isCollapsed) {
            updateRounds(rounds.map((r, i) => (i === idx ? { ...r, isCollapsed: true } : r)));
        } else {
            pendingScrollRoundId.current = roundId;
            updateRounds(withOnlyExpanded(rounds, idx));
        }
    };
    const deleteRound = (id: string) => {
        if (window.confirm("确认删除？")) updateRounds(rounds.filter(r => r.id !== id));
    };
    const cloneRound = (r: Round) => {
        const opReq = getRoundOperationRequirements(r);
        const newGroups = opReq.groups.map(g => ({
            id: generateId(),
            actions: g.actions.map(a => ({
                ...a,
                id: generateId(),
                relativeRules: a.relativeRules.map(rule => ({ ...rule, id: generateId(), targetId: '' })),
                preferences: (a.preferences || []).map(p => ({ ...p, id: generateId() }))
            }))
        }));
        const operationRequirements = { groups: newGroups };

        const newIndex = rounds.length;
        const cloned: Round = {
            ...r,
            id: generateId(),
            operationRequirements,
            actions: newGroups[0]?.actions ?? [],
            hitRecord: {
                ...(r.hitRecord ?? DEFAULT_HIT_RECORD),
                hitOrder: [...(r.hitRecord?.hitOrder ?? DEFAULT_HIT_RECORD.hitOrder)]
            },
            currentColors: [...(r.currentColors ?? DEFAULT_CURRENT_COLORS)]
        };
        pendingScrollRoundId.current = cloned.id;
        updateRounds(withOnlyExpanded([...rounds, cloned], newIndex));
    };

    const handleExport = () => {
        const data = { slots, rounds, version: 'xunyou-v1' };
        return {
            data: JSON.stringify(data, null, 2),
            filename: 'xunyou-v1.json'
        };
    };
    const handleImport = (json: string) => {
        try {
            const d = JSON.parse(json);
            if (d.slots && d.rounds) {
                if (window.confirm('确定覆盖当前数据吗？')) {
                    pushHistory(rounds);
                    setSlots(d.slots);
                    setRounds((d.rounds as Partial<Round>[]).map((r: Partial<Round>) =>
                        normalizeRound({ ...r, id: r.id ?? generateId() })
                    ));
                }
            } else {
                alert('数据格式错误');
            }
        } catch {
            alert('解析失败');
        }
    };

    const coreElementsOk = hasAllCoreElements(slots);
    useLevelToolbar({ onExport: handleExport, onImport: handleImport });

    const [swapSlotIndex, setSwapSlotIndex] = useState<number | null>(null);
    const handleSlotSwap = (index: number) => {
        if (swapSlotIndex === null) {
            setSwapSlotIndex(index);
        } else if (swapSlotIndex === index) {
            setSwapSlotIndex(null); // 取消选中
        } else {
            // 执行交换
            // 1. 交换属性 (Slots)
            const newSlots = [...slots];
            const tempEl = newSlots[swapSlotIndex].element;
            newSlots[swapSlotIndex].element = newSlots[index].element;
            newSlots[index].element = tempEl;

            // 2. 交换所有回合中的操作位置 (Rounds)
            const newRounds = rounds.map(r => {
                const opReq = getRoundOperationRequirements(r);
                const newGroups = opReq.groups.map(g => ({
                    ...g,
                    actions: g.actions.map(a => {
                        if (a.slotIndex === swapSlotIndex) return { ...a, slotIndex: index };
                        if (a.slotIndex === index) return { ...a, slotIndex: swapSlotIndex };
                        return a;
                    })
                }));
                return {
                    ...r,
                    operationRequirements: { groups: newGroups },
                    actions: newGroups[0]?.actions ?? r.actions ?? []
                };
            });

            // 保存历史并更新
            pushHistory(rounds);
            setSlots(newSlots);
            setRounds(newRounds);
            setSwapSlotIndex(null);
        }
    };

    return (
        <div className="bg-slate-50 text-slate-800 p-2 font-sans min-h-[500px] pb-20">
            {/* Header & Global Config */}
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200 pb-2 mb-4">
                {/* Part 1: 队伍属性配置 */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">队伍属性配置</div>
                        {swapSlotIndex !== null && <div
                            className="text-xs text-indigo-500 font-bold animate-pulse">请选择另一个位置交换...</div>}
                    </div>
                    {!coreElementsOk && (
                        <div
                            className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            地、水、火、风至少各一个，否则要在回合3前打完
                        </div>
                    )}

                    <div className="grid grid-cols-5 gap-2">
                        {slots.map((slot) => {
                            const isSwapping = swapSlotIndex === slot.index;
                            return (
                                <div
                                    key={slot.index}
                                    onClick={() => handleSlotSwap(slot.index)}
                                    className={`flex flex-col gap-1 p-2 rounded-lg transition-all cursor-pointer border group
                                        ${isSwapping
                                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20'
                                        : 'bg-transparent border-transparent hover:bg-slate-50 hover:border-slate-200'
                                    }`}
                                >
                                    <div className="flex justify-center items-center relative">
                                        <span
                                            className={`text-[10px] font-bold uppercase ${isSwapping ? 'text-indigo-600' : 'text-slate-400'}`}>
                                            {slot.index + 1}号位
                                        </span>
                                        <ArrowRightLeft size={10}
                                                        className={`absolute right-0 ${isSwapping ? 'text-indigo-500' : 'text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity'}`}/>
                                    </div>
                                    {/* 阻止下拉菜单点击事件冒泡，防止触发交换 */}
                                    <div onClick={(e) => e.stopPropagation()}>
                                        <ElementSelector current={slot.element} onChange={(e) => {
                                            const n = [...slots];
                                            n[slot.index].element = e;
                                            setSlots(n);
                                        }}/>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div
                className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm mb-4">
                <div className="flex gap-2">
                    <button onClick={handleUndo} disabled={history.length === 0}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-30 transition-all">
                        <RotateCcw size={14}/> 撤销
                    </button>
                    <button onClick={() => updateRounds([createDefaultRound(0)])}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 rounded hover:bg-red-100 transition-all">
                        <Trash2 size={14}/> 重置
                    </button>
                </div>
                <div className="text-xs font-bold text-slate-400">{rounds.length} 个回合</div>
            </div>

            {/* Part 2: 多回合推演 */}
            <div className="space-y-6">
                {rounds.map((round, idx) => (
                    <RoundComponent
                        key={round.id}
                        index={idx}
                        round={round}
                        slots={slots}
                        onUpdate={updateRound}
                        onToggleCollapse={() => toggleRoundCollapse(round.id)}
                        contentRef={el => {
                            roundContentRefs.current[round.id] = el;
                        }}
                        onDelete={() => deleteRound(round.id)}
                        onClone={() => cloneRound(round)}
                    />
                ))}
                <button onClick={addRound}
                        className="w-full py-3 flex items-center justify-center gap-2 text-indigo-500 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 font-bold transition-all">
                    <Plus size={18}/> 添加新回合
                </button>
            </div>

        </div>
    );
}
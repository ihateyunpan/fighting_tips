import { ArrowRightLeft, ChevronDown, ChevronRight, Copy, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLevelToolbar } from '../../../components/LevelContext';

// --- 类型定义（荀攸考核） ---
type ElementType = '地' | '水' | '火' | '风' | '阴' | '阳' | '混沌';
type CoreElement = '地' | '水' | '火' | '风';
type PermChar = CoreElement | '空';
type ColorChoice = CoreElement | '空白';
type ActionType = 'A' | '↑' | '↓' | '圈';
type ConstraintType = 'NONE' | 'FIXED' | 'RELATIVE' | 'IMMEDIATE';
type RelativeType = 'BEFORE' | 'AFTER';
type FixedOperator = 'AT' | 'BEFORE' | 'AFTER';
type PreferenceType = 'FIXED' | 'RELATIVE' | 'EARLY' | 'LATE';

// [新增] 软偏好规则
interface PreferenceRule {
    id: string;
    type: PreferenceType;
    // Fixed 参数
    fixedIndex?: number;
    fixedOperator?: FixedOperator;
    // Relative 参数
    targetId?: string;
    relativeType?: RelativeType;
}

interface RelativeRule {
    id: string;
    type: RelativeType;
    targetId: string;
}

interface ActionItem {
    id: string;
    types: ActionType[];
    slotIndex: number;
    // --- 硬性约束 ---
    constraint: ConstraintType;
    fixedIndex?: number;
    fixedOperator?: FixedOperator;
    relativeRules: RelativeRule[]; // 这里复用了 RelativeRule 结构，但在硬约束里只用作 RELATIVE
    immediateTargetId?: string;
    // --- [新增] 软性偏好 ---
    preferences: PreferenceRule[];
}

interface HitRecord {
    skillEnabled: boolean;
    hitOrder: (number | null)[];
}

interface Round {
    id: string;
    name?: string;
    actions: ActionItem[];
    isCollapsed?: boolean;
    requireAdjacentDifferent?: boolean;
    requireAttributeOrder?: boolean;
    hitRecord: HitRecord;
    currentColors: ColorChoice[];
}

interface Slot {
    index: number;
    element: ElementType;
}

interface ResolvedPath {
    path: ActionItem[];
    resolvedTypes: Map<string, ActionType>;
}

interface PlanRow {
    orderKey: string;
    order: PermChar[];
    solution: ResolvedPath | null;
}

const BASIC_ACTION_TYPES = ['A', '↑', '↓'] as const;
type BasicActionType = (typeof BASIC_ACTION_TYPES)[number];

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
const getDisplayId = (targetId: string, currentActions: ActionItem[]) => {
    const target = currentActions.find(a => a.id === targetId);
    if (!target) return '??';
    const slotOps = currentActions.filter(a => a.slotIndex === target.slotIndex);
    const index = slotOps.findIndex(a => a.id === targetId);
    return `${target.slotIndex + 1}${String.fromCharCode(97 + index)}`;
};// [新增] 获取显示的标签
const getActionLabel = (types: ActionType[]) => {
    if (types.includes('圈')) return '圈';
    // 检查是否包含 A, ↑, ↓ (即默认的“任意”)
    const resorted: string[] = [];
    const hasA = types.includes('A');
    const hasUp = types.includes('↑');
    const hasDown = types.includes('↓');
    if (hasA && hasUp && hasDown) return '任意';
    if (hasA) resorted.push('A');
    if (hasUp) resorted.push('↑');
    if (hasDown) resorted.push('↓');
    return resorted.join('/');
};
const getSlotContent = (resolved: ResolvedPath | null) => {
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
    actions: [],
    requireAdjacentDifferent: true,
    requireAttributeOrder: true,
    hitRecord: { skillEnabled: false, hitOrder: [null, null, null, null, null] },
    currentColors: [...DEFAULT_CURRENT_COLORS]
});

const copyToClipboard = (rows: string[][]) => {
    const text = rows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        // 可选：添加简单的 Toast 或 Alert 反馈
        alert("已复制到剪贴板");
    }).catch(err => {
        console.error('复制失败:', err);
    });
};

// --- 核心算法 ---
const buildDependencies = (actions: ActionItem[]) => {
    const dependencies = new Map<string, Set<string>>();
    const idToAction = new Map<string, ActionItem>();
    actions.forEach(a => {
        idToAction.set(a.id, a);
        if (!dependencies.has(a.id)) dependencies.set(a.id, new Set());
    });
    const slotsMap = new Map<number, ActionItem[]>();
    actions.forEach(a => {
        if (!slotsMap.has(a.slotIndex)) slotsMap.set(a.slotIndex, []);
        slotsMap.get(a.slotIndex)!.push(a);
    });
    slotsMap.forEach(group => {
        for (let i = 1; i < group.length; i++) {
            dependencies.get(group[i].id)!.add(group[i - 1].id);
        }
    });
    actions.forEach(a => {
        if (a.constraint === 'IMMEDIATE' && a.immediateTargetId && idToAction.has(a.immediateTargetId)) {
            dependencies.get(a.id)!.add(a.immediateTargetId);
        }
        if (a.constraint === 'RELATIVE') {
            a.relativeRules.forEach(rule => {
                if (!rule.targetId || !idToAction.has(rule.targetId)) return;
                if (rule.type === 'AFTER') dependencies.get(a.id)!.add(rule.targetId);
                else if (rule.type === 'BEFORE' && dependencies.has(rule.targetId)) dependencies.get(rule.targetId)!.add(a.id);
            });
        }
    });
    return { dependencies };
};

// 计算路径的偏好得分
const calculatePreferenceScore = (path: ActionItem[]) => {
    let score = 0;
    const pathIds = path.map(a => a.id);

    path.forEach((action, currentIndex) => {
        // 计算 effectiveIndex (排除圈)
        // 注意：软偏好里的 "第X个" 通常指有效操作的序数
        const effectiveSequence = path.slice(0, currentIndex + 1).filter(a => !a.types.includes('圈'));
        const currentEffectiveIndex = effectiveSequence.length; // 1-based

        (action.preferences || []).forEach(pref => {
            let met = false;
            switch (pref.type) {
                case 'EARLY':
                    // 越靠前分越高 (简单线性)
                    score += (10 - currentIndex);
                    break;
                case 'LATE':
                    // 越靠后分越高
                    score += currentIndex;
                    break;
                case 'FIXED': {
                    const targetIdx = pref.fixedIndex || 1;
                    const op = pref.fixedOperator || 'AT';
                    if (action.types.includes('圈')) break; // 圈不参与 Fixed 计数
                    if (op === 'AT' && currentEffectiveIndex === targetIdx) met = true;
                    else if (op === 'BEFORE' && currentEffectiveIndex < targetIdx) met = true;
                    else if (op === 'AFTER' && currentEffectiveIndex > targetIdx) met = true;
                    break;
                }
                case 'RELATIVE': {
                    if (!pref.targetId) break;
                    const targetPos = pathIds.indexOf(pref.targetId);
                    if (targetPos === -1) break; // 目标不在路径中(不太可能，除非是圈被过滤逻辑影响，暂时按物理路径算)
                    if (pref.relativeType === 'BEFORE' && currentIndex < targetPos) met = true;
                    if (pref.relativeType === 'AFTER' && currentIndex > targetPos) met = true;
                    break;
                }
            }
            if (met) score += 100; // 满足一个具体规则加 100 分
        });
    });
    return score;
};

const solveAllPaths = (actions: ActionItem[], requireAdjacentDifferent = true) => {
    if (actions.length < 5) return { paths: [] as ResolvedPath[], error: '需5个操作' };
    const { dependencies } = buildDependencies(actions);
    const allPaths: ResolvedPath[] = [];
    const totalSteps = actions.length;

    const dfs = (
        path: ActionItem[],
        resolvedTypes: Map<string, ActionType>,
        used: Set<string>
    ) => {
        if (path.length === totalSteps) {
            allPaths.push({ path: [...path], resolvedTypes: new Map(resolvedTypes) });
            return;
        }

        const effectiveCountSoFar = path.filter(a => !isCircleAction(a)).length;
        const prevNonCircleType = getPrevNonCircleType(path, resolvedTypes);

        for (const action of actions) {
            if (used.has(action.id)) continue;

            const isCircle = isCircleAction(action);
            const nextEffectiveIndex = effectiveCountSoFar + (isCircle ? 0 : 1);

            if (action.constraint === 'FIXED') {
                if (isCircle) continue;
                const targetIndex = action.fixedIndex || 1;
                const op = action.fixedOperator || 'AT';
                if (op === 'AT' && nextEffectiveIndex !== targetIndex) continue;
                if (op === 'BEFORE' && !(nextEffectiveIndex < targetIndex)) continue;
                if (op === 'AFTER' && !(nextEffectiveIndex > targetIndex)) continue;
            }
            if (action.constraint === 'IMMEDIATE') {
                if (path.length === 0) continue;
                const prevAction = path[path.length - 1];
                if (prevAction.id !== action.immediateTargetId) continue;
            }
            const parents = dependencies.get(action.id);
            let parentsSatisfied = true;
            if (parents && parents.size > 0) {
                for (const pid of parents) {
                    if (!used.has(pid)) {
                        parentsSatisfied = false;
                        break;
                    }
                }
            }
            if (!parentsSatisfied) continue;

            used.add(action.id);
            path.push(action);

            if (isCircle) {
                resolvedTypes.set(action.id, '圈');
                dfs(path, resolvedTypes, used);
                resolvedTypes.delete(action.id);
            } else {
                for (const type of getBasicTypes(action)) {
                    if (requireAdjacentDifferent && prevNonCircleType !== null && type === prevNonCircleType) continue;
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
    return {
        paths: allPaths,
        error: allPaths.length === 0 ? '无解 (冲突)' : null
    };
};

const buildPlanRows = (
    paths: ResolvedPath[],
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
        let solution: ResolvedPath | null = null;
        if (matching.length > 0) {
            solution = matching.reduce((best, cur) =>
                calculatePreferenceScore(cur.path) > calculatePreferenceScore(best.path) ? cur : best
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
                <div className="absolute top-full left-0 mt-1 z-40 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden p-1 flex flex-col gap-0.5">
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
                        <RotateCcw size={16} />
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
    const [editingId, setEditingId] = useState<string | null>(null);
    const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const titleInputRef = useRef<HTMLInputElement>(null);

    const hitRecord = round.hitRecord ?? DEFAULT_HIT_RECORD;
    const displayName = getRoundDisplayName(round, index);
    const currentColors = round.currentColors ?? DEFAULT_CURRENT_COLORS;
    const useFive = hitRecord.skillEnabled;
    const requireAdjacentDifferent = round.requireAdjacentDifferent ?? true;
    const requireAttributeOrder = round.requireAttributeOrder ?? true;

    const { paths, error } = useMemo(
        () => solveAllPaths(round.actions, requireAdjacentDifferent),
        [round.actions, requireAdjacentDifferent]
    );
    const planRows = useMemo(
        () => buildPlanRows(paths, slots, useFive, requireAttributeOrder),
        [paths, slots, useFive, requireAttributeOrder]
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
        if (!isEditingTitle) setTitleDraft(displayName);
    }, [displayName, isEditingTitle]);

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

    // Helpers
    const updateActions = (newActions: ActionItem[]) => onUpdate({ ...round, actions: newActions });
    const updateActionItem = (id: string, updates: Partial<ActionItem>) => updateActions(round.actions.map(a => a.id === id ? { ...a, ...updates } : a));

    // Add default action
    const addAction = (slotIndex: number) => {
        updateActions([...round.actions, {
            id: generateId(),
            types: ['A', '↑', '↓'],
            slotIndex,
            constraint: 'NONE',
            relativeRules: [],
            preferences: [] // Init preferences
        }]);
    };

    // Remove logic
    const removeAction = (id: string) => {
        updateActions(round.actions.filter(a => a.id !== id));
        if (editingId === id) setEditingId(null);
    };

    // Toggle Type logic
    const toggleActionType = (id: string, type: ActionType) => {
        const action = round.actions.find(a => a.id === id);
        if (!action) return;
        let newTypes: ActionType[] = [];
        if (type === '圈') newTypes = ['圈'];
        else {
            const currentWithoutCircle = action.types.filter(t => t !== '圈');
            if (currentWithoutCircle.includes(type)) {
                if (currentWithoutCircle.length > 1) newTypes = currentWithoutCircle.filter(t => t !== type);
                else return;
            } else {
                newTypes = [...currentWithoutCircle, type];
            }
        }
        updateActionItem(id, { types: newTypes });
    };

    // Swap logic
    const handleSwapClick = (id: string) => {
        if (swapSourceId === null) setSwapSourceId(id);
        else if (swapSourceId === id) setSwapSourceId(null);
        else {
            const newActions = [...round.actions];
            const idx1 = newActions.findIndex(a => a.id === swapSourceId);
            const idx2 = newActions.findIndex(a => a.id === id);
            if (idx1 !== -1 && idx2 !== -1) {
                const temp = newActions[idx1];
                newActions[idx1] = newActions[idx2];
                newActions[idx2] = temp;
                // Swap slots
                const tempSlot = newActions[idx1].slotIndex;
                newActions[idx1].slotIndex = newActions[idx2].slotIndex;
                newActions[idx2].slotIndex = tempSlot;
                updateActions(newActions);
            }
            setSwapSourceId(null);
        }
    };


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
                    <div className="mb-2 text-[10px] text-slate-400 flex flex-wrap gap-4 select-none">
                        <span>① 点击卡片编辑操作</span>
                        <span className="flex items-center gap-1">② 右下角 <ArrowRightLeft size={10}/> 交换顺序</span>
                        <span>③ 虚线框和灰色序号表示软偏好(尽量满足)</span>
                        <span>④ “{">"}” = 在某操作之前，“{"<"}” = 在某操作之后，“{"<<"}” = 紧跟某操作</span>
                    </div>

                    <div className="grid grid-cols-5 gap-2 mb-6">
                        {slots.map((slot) => (
                            <div key={slot.index}
                                 className={`flex flex-col gap-2 p-1.5 rounded-lg border border-dashed ${ELEMENTS[slot.element].border} bg-slate-50/50`}>
                                <div className="flex flex-col gap-1.5 min-h-[80px]">
                                    {round.actions.filter(a => a.slotIndex === slot.index).map((action) => {
                                        const displayId = getDisplayId(action.id, round.actions);
                                        const isSwapping = swapSourceId === action.id;

                                        // 1. 聚合 Fixed 信息 (Hard + Soft)
                                        const fixedItems: { val: number; op: FixedOperator; isSoft: boolean }[] = [];
                                        // Hard Fixed
                                        if (action.constraint === 'FIXED') {
                                            fixedItems.push({
                                                val: action.fixedIndex || 1,
                                                op: action.fixedOperator || 'AT',
                                                isSoft: false
                                            });
                                        }
                                        // Soft Fixed
                                        (action.preferences || []).forEach(p => {
                                            if (p.type === 'FIXED') {
                                                fixedItems.push({
                                                    val: p.fixedIndex || 1,
                                                    op: p.fixedOperator || 'AT',
                                                    isSoft: true
                                                });
                                            }
                                        });
                                        // 排序：从小到大
                                        fixedItems.sort((a, b) => a.val - b.val);

                                        // 2. 聚合 Badge 信息 (Hard Relative + Soft All)
                                        const badges: { label: React.ReactNode; isSoft: boolean }[] = [];

                                        // Hard Relative
                                        if (action.constraint === 'RELATIVE') {
                                            action.relativeRules.forEach(r => {
                                                const rType = r.type === 'BEFORE' ? '>' : '<';
                                                const target = getDisplayId(r.targetId, round.actions);
                                                badges.push({ label: `${rType}${target}`, isSoft: false });
                                            });
                                        }
                                        // Soft Prefs (Relative, Early, Late)
                                        (action.preferences || []).forEach(p => {
                                            if (p.type === 'EARLY') badges.push({ label: '靠前', isSoft: true });
                                            else if (p.type === 'LATE') badges.push({ label: '靠后', isSoft: true });
                                            else if (p.type === 'RELATIVE') {
                                                const rType = p.relativeType === 'BEFORE' ? '>' : '<';
                                                const target = getDisplayId(p.targetId || '', round.actions);
                                                badges.push({ label: `${rType}${target}`, isSoft: true });
                                            }
                                        });

                                        return (
                                            <div key={action.id}
                                                 className={`relative rounded border select-none transition-all flex flex-col overflow-hidden group min-h-[3.5rem] bg-white ${isSwapping ? 'border-indigo-500 ring-2 ring-indigo-500/20 z-10' : 'border-slate-200 hover:border-indigo-300'}`}>
                                                <div
                                                    className="absolute top-0.5 left-1 text-[9px] font-mono text-slate-300 font-bold pointer-events-none">{displayId}</div>
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeAction(action.id);
                                                }}
                                                        className="absolute top-0 right-0 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                    <X size={12} strokeWidth={3}/></button>

                                                <div onClick={() => setEditingId(action.id)}
                                                     className="flex-1 p-2 pt-3 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 gap-0.5">

                                                    {/* 主体内容：Fixed + Action */}
                                                    {action.constraint === 'IMMEDIATE' ? (
                                                        // Immediate 特殊样式
                                                        <div
                                                            className="flex items-center justify-center gap-1 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 mb-0.5">
                                                            <span
                                                                className="text-xs font-bold text-slate-700">{getActionLabel(action.types)}</span>
                                                            <span className="text-[10px] text-indigo-400">{'<<'}</span>
                                                            <span
                                                                className="text-[8px] font-mono bg-white border border-indigo-200 rounded px-1 text-indigo-600">{getDisplayId(action.immediateTargetId || '', round.actions)}</span>
                                                        </div>
                                                    ) : (
                                                        // 标准样式：Fixed + Action
                                                        <div
                                                            className="flex items-baseline justify-center gap-1 flex-wrap w-full">
                                                            {/* Fixed 序号部分 */}
                                                            {fixedItems.length > 0 && (
                                                                <div className="flex items-baseline">
                                                                    {fixedItems.map((f, i) => (
                                                                        <span key={i}
                                                                              className={`text-sm font-black leading-none whitespace-nowrap ${f.isSoft ? 'text-gray-300' : 'text-amber-500'}`}>
                                                                            {f.op === 'BEFORE' ? '<' : f.op === 'AFTER' ? '>' : ''}{f.val}
                                                                            {i < fixedItems.length - 1 && <span
                                                                                className="text-gray-300 font-normal mr-0.5">,</span>}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {/* 操作名 */}
                                                            <span
                                                                className="text-xs font-bold text-slate-700">{getActionLabel(action.types)}</span>
                                                        </div>
                                                    )}

                                                    {/* 统一 Badge 区域 (硬 Relative + 所有软偏好) */}
                                                    {badges.length > 0 && (
                                                        <div
                                                            className="flex flex-wrap justify-center gap-1 w-full px-1">
                                                            {badges.map((b, i) => (
                                                                <span key={i}
                                                                      className={`text-[9px] font-mono font-bold px-1 py-[1px] rounded border leading-none whitespace-nowrap ${b.isSoft
                                                                          ? 'border-dashed border-slate-300 text-slate-400 bg-slate-50'
                                                                          : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                                                      }`}>
                                                                    {b.label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                </div>

                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSwapClick(action.id);
                                                }}
                                                        className={`absolute bottom-0 right-0 p-1 rounded-tl ${isSwapping ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-indigo-500 hover:bg-slate-50'}`}>
                                                    <ArrowRightLeft size={10} strokeWidth={2}/></button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button onClick={() => addAction(slot.index)}
                                        className="mt-auto w-full py-1.5 flex items-center justify-center text-slate-300 border border-dashed border-slate-200 bg-white rounded hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                                    <Plus size={14} strokeWidth={3}/></button>
                            </div>
                        ))}
                    </div>

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

            {editingId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-[1px]">
                    <div
                        className="bg-white rounded-xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}>
                        {(() => {
                            const action = round.actions.find(a => a.id === editingId);
                            if (!action) return null;
                            const displayId = getDisplayId(action.id, round.actions);
                            // [修复] 定义安全访问的 preferences，防止 undefined
                            const safePreferences = action.preferences || [];

                            // Helper to update specific preference
                            const updatePref = (prefId: string, diff: Partial<PreferenceRule>) => {
                                updateActionItem(action.id, {
                                    preferences: safePreferences.map(p => p.id === prefId ? { ...p, ...diff } : p)
                                });
                            };
                            const addPref = (type: PreferenceType) => {
                                updateActionItem(action.id, {
                                    preferences: [...safePreferences, {
                                        id: generateId(),
                                        type,
                                        relativeType: 'BEFORE',
                                        fixedOperator: 'AT',
                                        fixedIndex: 1
                                    }]
                                });
                            };
                            const removePref = (prefId: string) => {
                                updateActionItem(action.id, {
                                    preferences: safePreferences.filter(p => p.id !== prefId)
                                });
                            };

                            return (
                                <>
                                    <div
                                        className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="font-mono text-xs font-bold bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">{displayId}</span>
                                            <span className="font-bold text-slate-700">编辑操作</span>
                                        </div>
                                        <button onClick={() => setEditingId(null)}
                                                className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
                                    </div>

                                    <div className="p-5 overflow-y-auto space-y-6">
                                        {/* 1. 操作类型 */}
                                        <div className="space-y-2">
                                            <label
                                                className="text-xs font-bold text-slate-400 uppercase tracking-wider">操作类型</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {['A', '↑', '↓', '圈'].map(t => {
                                                    const isSelected = action.types.includes(t as ActionType);
                                                    return (
                                                        <button key={t}
                                                                onClick={() => toggleActionType(action.id, t as ActionType)}
                                                                className={`py-2 rounded text-sm font-bold border transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                                            {t}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="border-t border-slate-100"></div>

                                        {/* 2. 硬性约束 (Hard Constraints) */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label
                                                    className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-slate-800"></div>
                                                    硬性约束 (必须满足)
                                                </label>
                                            </div>

                                            <div className="flex rounded-lg bg-slate-100 p-1">
                                                {[{ v: 'NONE', l: '无' }, { v: 'FIXED', l: '固定' }, {
                                                    v: 'RELATIVE',
                                                    l: '相对'
                                                }, { v: 'IMMEDIATE', l: '紧跟' }].map(opt => (
                                                    <button key={opt.v} onClick={() => updateActionItem(action.id, {
                                                        constraint: opt.v as ConstraintType,
                                                        fixedIndex: 1,
                                                        fixedOperator: 'AT',
                                                        relativeRules: [],
                                                        immediateTargetId: ''
                                                    })}
                                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${action.constraint === opt.v ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{opt.l}</button>
                                                ))}
                                            </div>

                                            {action.constraint === 'FIXED' && (
                                                <div
                                                    className="flex flex-col gap-2 py-2 bg-slate-50 rounded-lg border border-slate-200 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div
                                                        className="flex rounded bg-white border border-slate-200 p-0.5">
                                                        {[{ v: 'BEFORE', l: '第X个前 (<)' }, {
                                                            v: 'AT',
                                                            l: '第X个 (=)'
                                                        }, { v: 'AFTER', l: '第X个后 (>)' }].map(opt => (
                                                            <button key={opt.v}
                                                                    onClick={() => updateActionItem(action.id, { fixedOperator: opt.v as FixedOperator })}
                                                                    className={`flex-1 py-1 text-[10px] font-bold rounded transition-colors ${(action.fixedOperator || 'AT') === opt.v ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:bg-slate-50'}`}>{opt.l}</button>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center justify-center gap-3">
                                                        <span className="text-sm text-slate-500 font-medium">X = </span>
                                                        <div
                                                            className="flex items-center bg-white rounded border border-slate-200">
                                                            <button
                                                                onClick={() => updateActionItem(action.id, { fixedIndex: Math.max(1, (action.fixedIndex || 1) - 1) })}
                                                                className="px-3 py-1 text-slate-500 hover:bg-slate-50 font-bold border-r border-slate-100">-
                                                            </button>
                                                            <span
                                                                className="w-10 text-center font-bold text-slate-700">{action.fixedIndex || 1}</span>
                                                            <button
                                                                onClick={() => updateActionItem(action.id, { fixedIndex: Math.min(20, (action.fixedIndex || 1) + 1) })}
                                                                className="px-3 py-1 text-slate-500 hover:bg-slate-50 font-bold border-l border-slate-100">+
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {action.constraint === 'IMMEDIATE' && (
                                                <div
                                                    className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <span
                                                        className="text-xs font-bold text-slate-500 whitespace-nowrap">紧接在</span>
                                                    <select value={action.immediateTargetId || ''}
                                                            onChange={(e) => updateActionItem(action.id, { immediateTargetId: e.target.value })}
                                                            className="flex-1 text-xs border border-slate-300 rounded py-1.5 pl-2 bg-white focus:ring-2 focus:ring-indigo-500">
                                                        <option value="">选择操作...</option>
                                                        {slots.map(s => {
                                                            const groupOps = round.actions.filter(a => a.slotIndex === s.index && a.id !== action.id);
                                                            if (groupOps.length === 0) return null;
                                                            return <optgroup key={s.index}
                                                                             label={`${s.index + 1}号位 (${s.element})`}>{groupOps.map(op =>
                                                                <option key={op.id}
                                                                        value={op.id}>{s.index + 1}号位-{getActionLabel(op.types)} ({getDisplayId(op.id, round.actions)})</option>)}</optgroup>
                                                        })}
                                                    </select>
                                                    <span
                                                        className="text-xs font-bold text-slate-500 whitespace-nowrap">之后</span>
                                                </div>
                                            )}

                                            {action.constraint === 'RELATIVE' && (
                                                <div
                                                    className="space-y-2 bg-slate-50 p-2 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {action.relativeRules.map(rule => (
                                                        <div key={rule.id}
                                                             className="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200 shadow-sm">
                                                            <button
                                                                onClick={() => updateActions(round.actions.map(a => a.id === action.id ? {
                                                                    ...a,
                                                                    relativeRules: a.relativeRules.filter(r => r.id !== rule.id)
                                                                } : a))} className="text-slate-300 hover:text-red-500">
                                                                <X size={14}/></button>
                                                            <select value={rule.targetId}
                                                                    onChange={(e) => updateActions(round.actions.map(a => a.id === action.id ? {
                                                                        ...a,
                                                                        relativeRules: a.relativeRules.map(r => r.id === rule.id ? {
                                                                            ...r,
                                                                            targetId: e.target.value
                                                                        } : r)
                                                                    } : a))}
                                                                    className="flex-1 text-xs border-slate-200 rounded py-1 pl-1 bg-transparent">
                                                                <option value="">选择操作...</option>
                                                                {slots.map(s => {
                                                                    const groupOps = round.actions.filter(a => a.slotIndex === s.index && a.id !== action.id && a.slotIndex !== action.slotIndex);
                                                                    if (groupOps.length === 0) return null;
                                                                    return <optgroup key={s.index}
                                                                                     label={`${s.index + 1}号位 (${s.element})`}>{groupOps.map(op =>
                                                                        <option key={op.id}
                                                                                value={op.id}>{s.index + 1}号位-{getActionLabel(op.types)} ({getDisplayId(op.id, round.actions)})</option>)}</optgroup>
                                                                })}
                                                            </select>
                                                            <button
                                                                onClick={() => updateActions(round.actions.map(a => a.id === action.id ? {
                                                                    ...a,
                                                                    relativeRules: a.relativeRules.map(r => r.id === rule.id ? {
                                                                        ...r,
                                                                        type: r.type === 'BEFORE' ? 'AFTER' : 'BEFORE'
                                                                    } : r)
                                                                } : a))}
                                                                className={`shrink-0 px-2 py-1 rounded text-xs font-bold w-12 text-center ${rule.type === 'BEFORE' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{rule.type === 'BEFORE' ? '之前' : '之后'}</button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        onClick={() => updateActions(round.actions.map(a => a.id === action.id ? {
                                                            ...a,
                                                            relativeRules: [...a.relativeRules, {
                                                                id: generateId(),
                                                                type: 'BEFORE',
                                                                targetId: ''
                                                            }]
                                                        } : a))}
                                                        className="w-full py-1.5 text-xs font-medium text-indigo-600 border border-dashed border-indigo-200 rounded hover:bg-indigo-50">+
                                                        添加条件
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t border-slate-100"></div>

                                        {/* 3. 软性偏好 (Soft Preferences) */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label
                                                    className="text-xs font-bold text-gray-500 flex items-center gap-2">
                                                    <div
                                                        className="w-2 h-2 rounded-full border border-gray-400 border-dashed"></div>
                                                    软性偏好 (尽量满足)
                                                </label>

                                                {/* Add Preference Buttons */}
                                                <div className="flex gap-1">
                                                    <button onClick={() => addPref('EARLY')}
                                                            className="px-2 py-1 text-[10px] bg-slate-50 border border-slate-200 rounded hover:bg-slate-100">+
                                                        靠前
                                                    </button>
                                                    <button onClick={() => addPref('LATE')}
                                                            className="px-2 py-1 text-[10px] bg-slate-50 border border-slate-200 rounded hover:bg-slate-100">+
                                                        靠后
                                                    </button>
                                                    <button onClick={() => addPref('FIXED')}
                                                            className="px-2 py-1 text-[10px] bg-slate-50 border border-slate-200 rounded hover:bg-slate-100">+
                                                        固定
                                                    </button>
                                                    <button onClick={() => addPref('RELATIVE')}
                                                            className="px-2 py-1 text-[10px] bg-slate-50 border border-slate-200 rounded hover:bg-slate-100">+
                                                        相对
                                                    </button>
                                                </div>
                                            </div>

                                            {safePreferences.length === 0 && (
                                                <div
                                                    className="text-xs text-slate-300 italic text-center py-2">暂无偏好</div>
                                            )}

                                            <div className="space-y-2">
                                                {safePreferences.map(pref => (
                                                    <div key={pref.id}
                                                         className="bg-white border border-dashed border-slate-300 rounded p-2 flex gap-2 items-start group">
                                                        {/* Type Badge */}
                                                        <div
                                                            className="shrink-0 px-1.5 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-500 rounded border border-slate-200">
                                                            {pref.type === 'EARLY' && '靠前'}
                                                            {pref.type === 'LATE' && '靠后'}
                                                            {pref.type === 'FIXED' && '固定'}
                                                            {pref.type === 'RELATIVE' && '相对'}
                                                        </div>

                                                        {/* Config Area */}
                                                        <div className="flex-1 space-y-2">
                                                            {/* Fixed Config */}
                                                            {pref.type === 'FIXED' && (
                                                                <div className="flex items-center gap-2">
                                                                    <div
                                                                        className="flex rounded bg-slate-50 border border-slate-200 p-0.5">
                                                                        {[{ v: 'BEFORE', l: '<' }, {
                                                                            v: 'AT',
                                                                            l: '='
                                                                        }, { v: 'AFTER', l: '>' }].map(opt => (
                                                                            <button key={opt.v}
                                                                                    onClick={() => updatePref(pref.id, { fixedOperator: opt.v as FixedOperator })}
                                                                                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${pref.fixedOperator === opt.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>{opt.l}</button>
                                                                        ))}
                                                                    </div>
                                                                    <div
                                                                        className="flex items-center bg-slate-50 rounded border border-slate-200">
                                                                        <button
                                                                            onClick={() => updatePref(pref.id, { fixedIndex: Math.max(1, (pref.fixedIndex || 1) - 1) })}
                                                                            className="px-2 text-slate-400 hover:text-slate-600">-
                                                                        </button>
                                                                        <span
                                                                            className="w-6 text-center text-xs font-bold text-slate-600">{pref.fixedIndex}</span>
                                                                        <button
                                                                            onClick={() => updatePref(pref.id, { fixedIndex: Math.min(20, (pref.fixedIndex || 1) + 1) })}
                                                                            className="px-2 text-slate-400 hover:text-slate-600">+
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Relative Config */}
                                                            {pref.type === 'RELATIVE' && (
                                                                <div className="flex items-center gap-2">
                                                                    <select value={pref.targetId}
                                                                            onChange={(e) => updatePref(pref.id, { targetId: e.target.value })}
                                                                            className="flex-1 text-xs border border-slate-200 rounded py-1 pl-1 bg-white">
                                                                        <option value="">选择操作...</option>
                                                                        {slots.map(s => {
                                                                            const groupOps = round.actions.filter(a => a.slotIndex === s.index && a.id !== action.id);
                                                                            if (groupOps.length === 0) return null;
                                                                            return <optgroup key={s.index}
                                                                                             label={`${s.index + 1}号位 (${s.element})`}>{groupOps.map(op =>
                                                                                <option key={op.id}
                                                                                        value={op.id}>{s.index + 1}号位-{getActionLabel(op.types)} ({getDisplayId(op.id, round.actions)})</option>)}</optgroup>
                                                                        })}
                                                                    </select>
                                                                    <button
                                                                        onClick={() => updatePref(pref.id, { relativeType: pref.relativeType === 'BEFORE' ? 'AFTER' : 'BEFORE' })}
                                                                        className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold w-10 text-center ${pref.relativeType === 'BEFORE' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                                                        {pref.relativeType === 'BEFORE' ? '前' : '后'}
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {(pref.type === 'EARLY' || pref.type === 'LATE') && (
                                                                <div
                                                                    className="text-[10px] text-slate-400">尽可能{pref.type === 'EARLY' ? '排在前面' : '排在后面'}</div>
                                                            )}
                                                        </div>

                                                        {/* Delete Button */}
                                                        <button onClick={() => removePref(pref.id)}
                                                                className="text-slate-300 hover:text-red-500 p-1"><X
                                                            size={14}/></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex justify-between shrink-0">
                                            <button onClick={() => removeAction(action.id)}
                                                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                                                <Trash2 size={14}/> 删除操作
                                            </button>
                                            <button onClick={() => setEditingId(null)}
                                                    className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded shadow-sm hover:bg-indigo-700">完成
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
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
    return {
        id: raw.id,
        actions: (raw.actions ?? []).map(a => ({
            ...a,
            preferences: a.preferences ?? [],
            relativeRules: a.relativeRules ?? []
        })),
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
        // 深拷贝 actions 并生成新 ID
        const newActions = r.actions.map(a => ({
            ...a,
            id: generateId(),
            relativeRules: a.relativeRules.map(rule => ({ ...rule, id: generateId(), targetId: '' }))
        }));

        const newIndex = rounds.length;
        const cloned: Round = {
            ...r,
            id: generateId(),
            actions: newActions,
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
            const newRounds = rounds.map(r => ({
                ...r,
                actions: r.actions.map(a => {
                    if (a.slotIndex === swapSlotIndex) return { ...a, slotIndex: index };
                    if (a.slotIndex === index) return { ...a, slotIndex: swapSlotIndex };
                    return a;
                })
            }));

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
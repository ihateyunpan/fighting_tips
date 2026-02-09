import {
    ArrowRightLeft,
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Plus,
    RotateCcw,
    Settings2,
    Trash2,
    X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLevelToolbar } from '../../components/LevelContext';

// --- 类型定义 ---
type ElementType = '地' | '水' | '火' | '风' | '阴' | '阳' | '混沌';
type ActionType = 'A' | '↑' | '↓' | '圈';
type ConstraintType = 'NONE' | 'FIXED' | 'RELATIVE' | 'IMMEDIATE';
type RelativeType = 'BEFORE' | 'AFTER';
type FixedOperator = 'AT' | 'BEFORE' | 'AFTER';
type PreferenceType = 'FIXED' | 'RELATIVE' | 'EARLY' | 'LATE'; // [新增]
type DecisionMode = 'BUY' | 'NOT_BUY';

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

interface Round {
    id: string;
    actions: ActionItem[];
    isCollapsed?: boolean;
    selectedItemName?: string; // 新增：该回合选择的物品
    decisionMode?: DecisionMode; // 新增：该回合是购买还是不买
}

interface Slot {
    index: number;
    element: ElementType;
}

// --- 常量 ---
const ELEMENTS: Record<ElementType, { bg: string; text: string; lightBg: string; border: string }> = {
    '地': { bg: 'bg-amber-800', text: 'text-amber-100', lightBg: 'bg-amber-50', border: 'border-amber-200' },
    '水': { bg: 'bg-blue-500', text: 'text-blue-50', lightBg: 'bg-blue-50', border: 'border-blue-200' },
    '火': { bg: 'bg-red-500', text: 'text-red-50', lightBg: 'bg-red-50', border: 'border-red-200' },
    '风': { bg: 'bg-emerald-500', text: 'text-emerald-50', lightBg: 'bg-emerald-50', border: 'border-emerald-200' },
    '阴': { bg: 'bg-purple-600', text: 'text-purple-50', lightBg: 'bg-purple-50', border: 'border-purple-200' },
    '阳': { bg: 'bg-yellow-400', text: 'text-yellow-900', lightBg: 'bg-yellow-50', border: 'border-yellow-200' },
    '混沌': { bg: 'bg-slate-600', text: 'text-slate-100', lightBg: 'bg-slate-100', border: 'border-slate-200' }
};

const ITEMS_DICT: Record<string, number> = {
    "乐毅的马鞭": 2, "扁鹊的药罐": 3, "管仲的护膝": 5, "霍去病的眼镜": 6,
    "黄石公的鞋拔子": 7, "卫青的钓竿": 8, "始皇的按摩梳": 9, "高祖的文凭": 10,
    "文帝的遮阳伞": 11, "武帝的饭碗": 12, "炎帝的锄头": 13, "黄帝的内经": 14, "蚩尤的坐骑": 15
};
const REAL_ITEM_PRICES = new Set(Object.values(ITEMS_DICT));

const EMPTY_ITEM_LABEL = '不买任何物品';

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
const getSlotContent = (actions: ActionItem[] | null) => {
    const slotContents: string[] = Array(5).fill('');

    if (actions) {
        actions.forEach((act, sequenceIndex) => {
            // 注意：这里的 sequenceIndex 是物理顺序
            // 对于操作表，我们可能更关心“它是第几个有效操作”？
            // 之前的逻辑是物理顺序。鉴于“圈”不占有效位，我们可以加个标记或者仅显示内容

            // 为了清晰，我们显示：
            // 如果是圈： "圈"
            // 如果是有效操作： "1.A" (假设它是第1个有效操作)
            let prefix = "";
            if (!act.types.includes('圈')) {
                // 计算它是第几个有效操作
                const effectiveIndex = actions.slice(0, sequenceIndex + 1).filter(a => !a.types.includes('圈')).length;
                prefix = `${effectiveIndex}`;
            }

            const content = `${prefix}${getActionLabel(act.types)}`;
            slotContents[act.slotIndex] = slotContents[act.slotIndex] ? slotContents[act.slotIndex] + ` ${content}` : content;
        });
    }

    return slotContents;
};
const getActionForEmptyItem = (solutions: Record<string, ActionItem[]>) => {
    let solution: ActionItem[] | null = null;
    let isAchievable = false;

    // [新增] 处理空item逻辑：找一个不在商品价格表里的解
    const emptyGoldStr = Object.keys(solutions).find(g => !REAL_ITEM_PRICES.has(Number(g)));
    if (emptyGoldStr) {
        solution = solutions[Number(emptyGoldStr)];
        isAchievable = true;
    } else {
        // 选了空item但当前所有解都是有效商品（极少见但逻辑上可能），或者无解
        isAchievable = false;
    }

    return { solution, isAchievable };
};
const copyToClipboard = (rows: string[][]) => {
    const text = rows.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        // 可选：添加简单的 Toast 或 Alert 反馈
        alert("已复制到剪贴板");
    }).catch(err => {
        console.error('复制失败:', err);
    });
};
const formatItemName = (name: string, price?: number) => price !== undefined ? `${name}(${price})` : name;

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

// [修改] 金币计算：圈不占位
const calculateGold = (sequence: ActionItem[], currentSlots: Slot[]) => {
    let total = 0;
    // 1. 过滤掉“圈”操作，生成有效序列
    const effectiveSequence = sequence.filter(a => !a.types.includes('圈'));

    // 2. 基于有效序列计算
    const getEl = (idx: number) => currentSlots[effectiveSequence[idx].slotIndex].element;

    if (effectiveSequence.length > 0 && (getEl(0) === '阳' || getEl(0) === '风')) total += 1;
    if (effectiveSequence.length > 1 && (getEl(1) === '阳' || getEl(1) === '水')) total += 2;
    if (effectiveSequence.length > 2 && (getEl(2) === '阳' || getEl(2) === '阴')) total += 3;
    if (effectiveSequence.length > 3 && (getEl(3) === '风' || getEl(3) === '水')) total += 4;
    if (effectiveSequence.length > 4 && (getEl(4) === '水' || getEl(4) === '阴')) total += 5;
    return total;
};

// --- 核心算法更新 ---

// [新增] 计算路径的偏好得分
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

// [修改] 求解器：支持软偏好打分
const solveRound = (actions: ActionItem[], slots: Slot[]) => {
    if (actions.length < 5) return { solutions: {}, error: "需5个操作" };
    const { dependencies } = buildDependencies(actions);

    // 存储结构：Gold -> { score: number, path: ActionItem[] }
    // 最后只返回 Record<number, ActionItem[]> 以兼容 UI
    const bestResults: Record<number, { score: number, path: ActionItem[] }> = {};

    const totalSteps = actions.length;

    const dfs = (path: ActionItem[], used: Set<string>) => {
        if (path.length === totalSteps) {
            const gold = calculateGold(path, slots);
            const score = calculatePreferenceScore(path);

            // 如果当前金币还没有解，或者当前解的分数更高，则更新
            if (!bestResults[gold] || score > bestResults[gold].score) {
                bestResults[gold] = { score, path: [...path] };
            }
            return;
        }

        const effectiveCountSoFar = path.filter(a => !a.types.includes('圈')).length;

        for (const action of actions) {
            if (used.has(action.id)) continue;

            const isCircle = action.types.includes('圈');
            const nextEffectiveIndex = effectiveCountSoFar + (isCircle ? 0 : 1);

            // 1. 硬约束检查 (Pruning) - 保持不变
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

            // 2. 递归
            used.add(action.id);
            path.push(action);
            dfs(path, used);
            path.pop();
            used.delete(action.id);
        }
    };

    dfs([], new Set());

    // 转换回旧格式返回
    const solutions: Record<number, ActionItem[]> = {};
    Object.entries(bestResults).forEach(([gold, res]) => {
        solutions[Number(gold)] = res.path;
    });

    return { solutions, error: Object.keys(solutions).length === 0 ? "无解 (冲突)" : null };
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

const RoundComponent = ({ round, slots, index, onUpdate, onDelete, onClone }: {
    round: Round;
    slots: Slot[];
    index: number;
    onUpdate: (r: Round) => void;
    onDelete: () => void;
    onClone: () => void;
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
    const [selectedRow, setSelectedRow] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<'AMOUNT' | 'MATCH'>('AMOUNT'); // 商品排序模式

    // Memoize solution
    const { solutions, error } = useMemo(() => solveRound(round.actions, slots), [round.actions, slots]);

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

    // Copy logic
    const getSortedItems = () => {
        const entries = Object.entries(ITEMS_DICT).map(([name, price]) => {
            const solution = solutions[price];
            const matchScore = solution ? calculatePreferenceScore(solution) : -Infinity;
            return { name, price, solution, matchScore };
        });

        return entries.sort((a, b) => {
            if (sortMode === 'AMOUNT') {
                return a.price - b.price;
            }
            const diff = b.matchScore - a.matchScore;
            return diff !== 0 ? diff : a.price - b.price;
        });
    };

    const handleCopyTable = () => {
        const sortedItems = getSortedItems().filter(item => item.solution);
        const rows = sortedItems.map(item => [
            formatItemName(item.name, item.price),
            ...getSlotContent(item.solution!)
        ]);
        const emptyItemSolution = getActionForEmptyItem(solutions).solution;
        if (emptyItemSolution) rows.push([EMPTY_ITEM_LABEL, ...getSlotContent(emptyItemSolution)]);
        if (rows.length > 0) copyToClipboard(rows);
    };

    // --- Row Renderer ---
    const getRow = (isSelected: boolean, name: string, solution: ActionItem[], price?: number) => {
        const slotContents = getSlotContent(solution);
        return (
            <tr key={name} onClick={() => setSelectedRow(isSelected ? null : name)}
                className={`transition-all cursor-pointer border-b border-slate-50 last:border-0 ${!solution ? 'opacity-40 grayscale hover:grayscale-0' : ''}`}>
                <td className={`p-3 font-medium border-r border-slate-100 ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-800'}`}>
                    <div className="font-bold">{name}</div>
                    {price != null && <div
                        className="text-[10px] opacity-60 bg-black/5 inline-block px-1.5 rounded mt-0.5">💰 {price}</div>}
                </td>
                {slots.map((s, idx) => (
                    <td key={idx}
                        className={`p-3 border-r border-white font-mono font-bold ${isSelected ? 'bg-indigo-50 text-indigo-900' : `${ELEMENTS[s.element].lightBg} text-slate-600`}`}>
                        {solution ? (slotContents[idx] || <span className="opacity-30 font-normal">-</span>) : '-'}
                    </td>
                ))}
                <td className="p-3 text-center">
                    {solution && <button onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard([[formatItemName(name, price), ...slotContents]]);
                    }} className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-slate-100"><Copy size={14}/>
                    </button>}
                </td>
            </tr>
        );
    };

    const emptyItemSolution = getActionForEmptyItem(solutions).solution;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <button onClick={() => onUpdate({ ...round, isCollapsed: !round.isCollapsed })}
                            className="text-slate-400 hover:text-slate-600">
                        {round.isCollapsed ? <ChevronRight size={18}/> : <ChevronDown size={18}/>}
                    </button>
                    <span className="font-bold text-slate-700">第 {index + 1} 回合</span>
                    <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${round.actions.length === 5 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{round.actions.length}/5 操作</span>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClone}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Copy
                        size={16}/></button>
                    <button onClick={onDelete}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2
                        size={16}/></button>
                </div>
            </div>

            {!round.isCollapsed && (
                <div className="p-4">
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

                    <div className="border-t border-slate-100 pt-4">
                        <div className="flex justify-between items-end mb-2">
                            <div className="text-[10px] text-slate-400 italic">*
                                若出现本回合无法购买的商品，按任意顺序操作均可
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSortMode(sortMode === 'AMOUNT' ? 'MATCH' : 'AMOUNT')}
                                    className="px-2 py-1 text-xs font-medium rounded border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                                >
                                    →{sortMode === 'AMOUNT' ? '按要求匹配度排序' : '按商品金额排序'}
                                </button>
                                <button onClick={handleCopyTable}
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors">
                                    <Copy size={12}/> 复制可行方案
                                </button>
                            </div>
                        </div>
                        {error ? (
                            <div
                                className="text-xs text-red-500 font-bold flex items-center gap-1 bg-red-50 p-2 rounded">
                                <Settings2 size={12}/> {error}</div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 text-slate-500 font-bold border-b border-slate-200">
                                    <tr>
                                        <th className="p-3 w-1/6">物品</th>
                                        {slots.map((s) => (<th key={s.index}
                                                               className={`p-3 w-1/6 ${ELEMENTS[s.element].lightBg} text-slate-700 border-l border-white`}>{s.index + 1}号位 <span
                                            className="opacity-50 font-normal">({s.element})</span></th>))}
                                        <th className="p-3 w-10"></th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {getSortedItems().map(({ name, price, solution }) =>
                                        getRow(selectedRow === name, name, solution, price)
                                    )}
                                    {emptyItemSolution != null && getRow(selectedRow === EMPTY_ITEM_LABEL, EMPTY_ITEM_LABEL, emptyItemSolution)}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
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

// --- Part 3: 汇总表组件 (Modal样式优化版) ---
const SummaryTable = ({ rounds, slots, onUpdateRound }: {
    rounds: Round[],
    slots: Slot[],
    onUpdateRound: (r: Round) => void
}) => {
    const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
    const [selectedRow, setSelectedRow] = useState<string | null>(null);

    const getDisplayInfoForRound = (round: Round) => {
        const { solutions, error } = solveRound(round.actions, slots);
        const selectedItemName = round.selectedItemName;
        const decisionMode: DecisionMode = round.decisionMode || 'BUY';
        const targetPrice = (selectedItemName && selectedItemName !== EMPTY_ITEM_LABEL) ? ITEMS_DICT[selectedItemName] : null;

        let displaySolution: ActionItem[] | null = null;
        let isAchievable = false;

        if (selectedItemName === EMPTY_ITEM_LABEL) {
            ({ solution: displaySolution, isAchievable } = getActionForEmptyItem(solutions));
        } else if (targetPrice !== null) {
            if (decisionMode === 'BUY') {
                if (solutions[targetPrice]) {
                    displaySolution = solutions[targetPrice];
                    isAchievable = true;
                } else {
                    const allPaths = Object.values(solutions);
                    if (allPaths.length > 0) displaySolution = allPaths[0];
                    isAchievable = false;
                }
            } else {
                // NOT_BUY：从所有金币 != 目标金额的解中，选一条匹配度最高的
                let bestPath: ActionItem[] | null = null;
                let bestScore = -Infinity;
                Object.entries(solutions).forEach(([goldStr, path]) => {
                    const gold = Number(goldStr);
                    if (gold === targetPrice) return;
                    const score = calculatePreferenceScore(path);
                    if (score > bestScore) {
                        bestScore = score;
                        bestPath = path;
                    }
                });
                displaySolution = bestPath;
                isAchievable = false;
            }
        }

        return { solutions, error, displaySolution, isAchievable, decisionMode, selectedItemName, targetPrice };
    };

    // [新增] 处理全表复制
    const handleCopyAll = () => {
        const allRowsData = rounds.map(round => {
            const { displaySolution } = getDisplayInfoForRound(round);
            return getSlotContent(displaySolution);
        });
        copyToClipboard(allRowsData);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
            <div
                className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center font-bold text-slate-700">
                <span>决策汇总表</span>
                {/* [新增] 顶部复制按钮 */}
                <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1 text-xs font-normal text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors"
                >
                    <Copy size={12}/> 复制全部
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                        <th className="p-3 w-12 text-center">回合</th>
                        <th className="p-3 w-48">购买决策</th>
                        {slots.map((s) => (
                            <th key={s.index}
                                className={`p-3 ${ELEMENTS[s.element].lightBg} text-slate-700 border-l border-white`}>
                                {s.index + 1}号位 <span className="opacity-50 font-normal">({s.element})</span>
                            </th>
                        ))}
                        <th className="p-3 w-10"></th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {rounds.map((round, idx) => {
                        const {
                            solutions,
                            error,
                            displaySolution,
                            decisionMode,
                            selectedItemName,
                            targetPrice
                        } = getDisplayInfoForRound(round);
                        const slotContents: string[] = getSlotContent(displaySolution);

                        const isSelected = selectedRow === round.id;
                        const hasConstraintConflict = !!error;

                        const availablePrices = Object.keys(solutions).map(Number);
                        const isEmptySelected = selectedItemName === EMPTY_ITEM_LABEL;
                        const canBuySelected =
                            !!targetPrice && availablePrices.includes(targetPrice);
                        const emptyCanAchieve =
                            isEmptySelected &&
                            availablePrices.some(p => !REAL_ITEM_PRICES.has(p));

                        const decisionLabel =
                            decisionMode === 'BUY' ? '购买' : '不买';

                        const itemDisplayLabel =
                            selectedItemName || '选择商品 / 什么都不买';

                        return (
                            <tr key={round.id} onClick={() => setSelectedRow(isSelected ? null : round.id)}
                                className={`transition-all cursor-pointer border-b border-slate-50 last:border-0 ${isSelected ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}>
                                <td className="p-3 text-center font-bold text-slate-500 border-r border-slate-100">{idx + 1}</td>
                                <td className="p-3 border-r border-slate-100">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const nextMode: DecisionMode = (decisionMode === 'BUY' ? 'NOT_BUY' : 'BUY');
                                                    onUpdateRound({ ...round, decisionMode: nextMode });
                                                }}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full border transition-colors whitespace-nowrap ${decisionMode === 'BUY'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                                    : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                                            >
                                                {decisionMode === 'BUY' ? (
                                                    <>
                                                        <span>{decisionLabel}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>{decisionLabel}</span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingRoundId(round.id);
                                                }}
                                                className="flex-1 inline-flex items-center justify-between px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                                            >
                                                <div className="flex flex-col text-left min-w-0">
                                                        <span className="font-bold text-slate-700 truncate">
                                                            {itemDisplayLabel}
                                                        </span>
                                                </div>
                                                <ChevronDown size={12} className="text-slate-400 ml-1 shrink-0"/>
                                            </button>
                                        </div>
                                        <div className="text-[10px] mt-0.5">
                                            {hasConstraintConflict && (
                                                <span
                                                    className="inline-flex items-center px-1.5 py-0.5 rounded border border-red-100 bg-red-50 text-red-600 font-medium">
                                                        约束冲突：本回合无任何可行解
                                                    </span>
                                            )}
                                            {!hasConstraintConflict &&
                                                selectedItemName && (decisionMode === 'BUY') &&
                                                ((isEmptySelected && !emptyCanAchieve) ||
                                                    (!isEmptySelected && !canBuySelected)) && (
                                                    <span
                                                        className="inline-flex items-center px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-medium">
                                                        {isEmptySelected
                                                            ? '当前配置下暂无“什么都不买”的对应操作'
                                                            : '当前配置下无法通过本回合操作购买该物品'}
                                                    </span>
                                                )}
                                        </div>
                                    </div>
                                </td>
                                {slots.map((s, i) => (
                                    <td key={i}
                                        className={`p-3 border-r border-white font-mono font-bold ${isSelected ? 'bg-indigo-50 text-indigo-900' : `${ELEMENTS[s.element].lightBg} text-slate-600`}`}>
                                        {displaySolution ? (slotContents[i] ||
                                            <span className="opacity-30 font-normal">-</span>) : '-'}
                                    </td>
                                ))}
                                {/* [新增] 行复制按钮 */}
                                <td className="p-3 text-center">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard([slotContents]);
                                        }}
                                        className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-slate-100"
                                        title="复制该行操作"
                                    >
                                        <Copy size={14}/>
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>

            {/* Item Selection Modal (优化样式：绿色高亮可买，无置灰) */}
            {editingRoundId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-[1px]">
                    <div
                        className="bg-white rounded-xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}>
                        <div
                            className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                            <span className="font-bold text-slate-700">选择本回合物品</span>
                            <button onClick={() => setEditingRoundId(null)}><X size={18} className="text-slate-400"/>
                            </button>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                            {(() => {
                                const round = rounds.find(r => r.id === editingRoundId)!;
                                const { solutions } = solveRound(round.actions, slots);
                                const availablePrices = Object.keys(solutions).map(Number);

                                // [新增] 计算是否有“空item”的解（即产生的金币不属于任何商品）
                                const hasEmptyOption = availablePrices.some(p => !REAL_ITEM_PRICES.has(p));
                                const isEmptySelected = round.selectedItemName === EMPTY_ITEM_LABEL;

                                return (<>
                                    {/* [新增] 空item 按钮 */}
                                    <button
                                        onClick={() => {
                                            onUpdateRound({ ...round, selectedItemName: EMPTY_ITEM_LABEL });
                                            setEditingRoundId(null);
                                        }}
                                        className={`p-3 rounded-lg border text-left flex justify-between items-center transition-all ${isEmptySelected
                                            ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 z-10'
                                            : 'hover:border-indigo-300 hover:bg-slate-50 border-slate-200 bg-white'
                                        }`}
                                    >
                                        <div>
                                            <div
                                                className={`text-sm font-bold ${isEmptySelected ? 'text-indigo-900' : hasEmptyOption ? 'text-slate-700' : 'text-slate-400'}`}>
                                                {EMPTY_ITEM_LABEL}
                                            </div>
                                            <div
                                                className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded border border-transparent ${isEmptySelected ? 'bg-indigo-100 text-indigo-600' :
                                                    hasEmptyOption ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-400'
                                                }`}>
                                                {hasEmptyOption ? '✓ 可达成' : '不可达成'}
                                            </div>
                                        </div>
                                        {isEmptySelected && <Check size={16} className="text-indigo-600"/>}
                                    </button>
                                    {Object.entries(ITEMS_DICT).map(([name, price]) => {
                                        const isAvailable = availablePrices.includes(price);
                                        const isSelected = round.selectedItemName === name;

                                        // 样式逻辑
                                        let containerClass = "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"; // 默认：普通白底
                                        let textClass = "text-slate-600";
                                        let badgeClass = "bg-slate-100 text-slate-400";
                                        let badgeText = `💰 ${price}`;

                                        if (isSelected) {
                                            // 选中态：最高优先级，蓝紫色
                                            containerClass = "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 z-10";
                                            textClass = "text-indigo-900";
                                            badgeClass = "bg-indigo-100 text-indigo-600";
                                        } else if (isAvailable) {
                                            // 可购买态：绿色高亮
                                            containerClass = "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400";
                                            textClass = "text-emerald-900";
                                            badgeClass = "bg-emerald-100 text-emerald-700 font-bold";
                                            badgeText = "✓ 可购买";
                                        }

                                        return (
                                            <button
                                                key={name}
                                                onClick={() => {
                                                    onUpdateRound({ ...round, selectedItemName: name });
                                                    setEditingRoundId(null);
                                                }}
                                                className={`p-3 rounded-lg border text-left flex justify-between items-center transition-all ${containerClass}`}
                                            >
                                                <div>
                                                    <div className={`text-sm font-bold ${textClass}`}>
                                                        {name}
                                                    </div>
                                                    <div
                                                        className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded border border-transparent ${badgeClass}`}>
                                                        {badgeText}
                                                    </div>
                                                    {/* 如果可购买，额外显示价格辅助 */}
                                                    {isAvailable && !isSelected && <span
                                                        className="text-[10px] text-emerald-600/60 ml-1">💰{price}</span>}
                                                    {/* 如果不可购买，也显示价格 */}
                                                    {!isAvailable && !isSelected &&
                                                        <span className="text-[10px] text-slate-300 ml-1"></span>}
                                                </div>
                                                {isSelected && <Check size={16} className="text-indigo-600"/>}
                                            </button>
                                        );
                                    })}
                                </>);
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- 主应用组件 ---
export default function AlchemySolver() {
    const [slots, setSlots] = useStickyState<Slot[]>(Array.from({ length: 5 }, (_, i) => ({
        index: i,
        element: '地'
    })), 'relic19-slots-v6');
    const [rounds, setRounds] = useStickyState<Round[]>([{ id: generateId(), actions: [] }], 'relic19-rounds-v6');
    const [history, setHistory] = useState<Round[][]>([]);

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

    const addRound = () => {
        const collapsedExisting = rounds.map(r => ({ ...r, isCollapsed: true }));
        updateRounds([...collapsedExisting, { id: generateId(), actions: [] }]);
    };
    const updateRound = (updated: Round) => {
        updateRounds(rounds.map(r => {
            // 如果是当前正在更新的回合
            if (r.id === updated.id) return updated;

            // 如果更新后的回合是“展开”状态 (!isCollapsed)，则强制折叠其他回合
            // 这里的判断逻辑是：如果 updated.isCollapsed 为 falsy (undefined 或 false)，说明它是展开的
            if (!updated.isCollapsed) return { ...r, isCollapsed: true };

            return r;
        }));
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

        const collapsedExisting = rounds.map(prev => ({ ...prev, isCollapsed: true }));

        // ...r 会复制原有的 selectedItemName 等属性
        // 显式设置 isCollapsed: undefined 以确保新回合是展开的
        updateRounds([...collapsedExisting, { ...r, id: generateId(), actions: newActions, isCollapsed: undefined }]);
    };

    const handleExport = () => {
        const data = {
            slots,
            rounds,
            version: 'v6'
        };
        // === 修改点：只返回数据和文件名 ===
        return {
            data: JSON.stringify(data, null, 2),
            filename: `relic19_4-v6.json`
        };
    };
    const handleImport = (json: string) => {
        try {
            const d = JSON.parse(json);
            if (d.slots && d.rounds) {
                if (window.confirm("确定覆盖当前数据吗？")) {
                    pushHistory(rounds);
                    setSlots(d.slots);
                    setRounds(d.rounds);
                }
            } else {
                alert("数据格式错误");
            }
        } catch {
            alert("解析失败");
        }
    };
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
                    <button onClick={() => updateRounds([{ id: generateId(), actions: [] }])}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 rounded hover:bg-red-100 transition-all">
                        <Trash2 size={14}/> 重置
                    </button>
                </div>
                <div className="text-xs font-bold text-slate-400">{rounds.length} 个回合</div>
            </div>

            {/* Part 2: 多回合推演 */}
            <div className="space-y-6">
                {rounds.map((round, idx) => (
                    <RoundComponent key={round.id} index={idx} round={round} slots={slots} onUpdate={updateRound}
                                    onDelete={() => deleteRound(round.id)} onClone={() => cloneRound(round)}/>
                ))}
                <button onClick={addRound}
                        className="w-full py-3 flex items-center justify-center gap-2 text-indigo-500 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 font-bold transition-all">
                    <Plus size={18}/> 添加新回合
                </button>
            </div>

            {/* Part 3: 汇总表 */}
            <SummaryTable rounds={rounds} slots={slots} onUpdateRound={updateRound}/>
        </div>
    );
}
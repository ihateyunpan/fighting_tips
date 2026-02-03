import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLevelToolbar } from "../components/LevelContext";

// ==========================================
// 1. 核心逻辑 (State / Algorithms)
// ==========================================

// 常量定义
const HP_TOTAL = 3153280;
const HP_75 = Math.floor(HP_TOTAL * 0.75); // 2364960
const HP_50 = Math.floor(HP_TOTAL * 0.50); // 1576640
const HP_25 = Math.floor(HP_TOTAL * 0.25); // 788320

class State {
    count: number;
    is_attack: boolean;

    constructor(count: number, is_attack: boolean) {
        this.count = count;
        this.is_attack = is_attack;
    }

    clone(): State {
        return new State(this.count, this.is_attack);
    }

    add(delta: number) {
        let after = this.count + delta;
        if (after < 0 || after >= 20) {
            after = 0;
        }
        this.count = after;
    }
}

// 计算转阶段后的状态 (Target)
function getNextState(state: State, breakCount: number): State {
    const nextState = state.clone();
    for (let i = 0; i < breakCount; i++) nextState.add(10); // 打下阈值
    nextState.add(2);
    nextState.add(2); // 固定流程
    if (!nextState.is_attack) nextState.add(2);
    nextState.add(2);
    if (!nextState.is_attack) nextState.add(2);
    nextState.is_attack = !nextState.is_attack; // 切换状态
    return nextState;
}

function getDeltas(fromState: State, toState: State): string[] {
    if (toState.count >= fromState.count) return [`+${toState.count - fromState.count}`];
    const ans: string[] = [];
    const delta1 = fromState.count - toState.count;
    if (delta1 < 10) ans.push(`-${delta1}`);
    const delta2 = toState.count + 20 - fromState.count;
    if (delta2 < 10) ans.push(`+${delta2}`);
    else if (fromState.count + 10 >= 20) {
        if (toState.count === 0) ans.push("+10");
        else if (toState.count <= 6) ans.push(`+${toState.count}*`);
    }
    return ans;
}

// 模拟 P2 操作序列
function simulateOperations(
    initialGreen: number,
    initialMobFull: boolean,
    ops: Operation[],
    redPos: number,
    greenPos: number,
    mode: 'EMPTY' | 'FORWARD' | 'BACKWARD' = 'EMPTY',
): number[] {
    const simState = new State(initialGreen, !initialMobFull);
    const steps: number[] = [];

    for (const op of ops) {
        let currentPos = op.position;
        if (currentPos === 'red') currentPos = redPos;
        else if (currentPos === 'green') currentPos = greenPos;

        if (mode === 'FORWARD') {
            if (op.type === 'A') simState.add(1); else if (op.type === '↑') simState.add(2);
        } else if (mode === 'BACKWARD') {
            if (op.type === 'A') simState.add(-1); else if (op.type === '↑') simState.add(-2);
        }

        if (currentPos === redPos) mode = 'FORWARD';
        else if (currentPos === greenPos) mode = 'BACKWARD';

        steps.push(simState.count);
    }
    return steps;
}

// 步骤 2 专用：计算混合流程 (P1 -> Kill -> Transition -> P2)
// 返回: [targetCount, actualCount, isValid]
function calculateStep2Simulation(
    initialGreen: number,
    ops: Operation[],
    killOpId: string,
    redPos: number,
    greenPos: number
): { actual: number, steps: number[] } {
    const currentState = new State(initialGreen, true);

    // Actual Calculation
    // 1. Pre-Kill & Kill Processing
    let killIndex = ops.findIndex(o => o.id === killOpId);
    if (killIndex === -1 && ops.length > 0) killIndex = 0; // 默认第一个

    const steps: number[] = [];

    // 4.5.1 在杀死 boss 的操作（包含这个操作）前
    for (let i = 0; i <= killIndex && i < ops.length; i++) {
        const op = ops[i];
        if (op.type === 'A') {
            currentState.add(1);
        } else if (op.type === '↑') {
            currentState.add(2);
        }
        steps.push(currentState.count);
    }

    // 4.5.2 在杀死 boss 的操作后，同 simulateOptions
    const p2Ops = ops.slice(killIndex + 1);
    const p2Steps = simulateOperations(
        currentState.count,
        true,
        p2Ops,
        redPos,
        greenPos,
        ops[killIndex]?.position === redPos ? 'FORWARD' : (ops[killIndex]?.position === greenPos ? 'BACKWARD' : 'EMPTY'),
    );

    steps.push(...p2Steps);

    return {
        actual: steps.length > 0 ? steps[steps.length - 1] : initialGreen,
        steps
    };
}

// ==========================================
// 2. 类型定义
// ==========================================

type ActionType = 'A' | '↑' | '↓' | '圈';

interface Operation {
    id: string;
    position: number | 'red' | 'green';
    type: ActionType;
    killMob: boolean;
}

interface RoundSnapshot {
    operations: Operation[];
    selectedStrategyIdx: number | null;
}

interface RoundData {
    id: string;
    operations: Operation[];
    selectedStrategyIdx: number | null;
    history: RoundSnapshot[];
}

interface Step2Data {
    operations: Operation[];
    killOpId: string; // 哪个操作打死的 Boss
}

interface GlobalConfig {
    // Step 2 Inputs
    step2OurGreen: number | '';
    step2BossGreen: number | ''; // === 新增: boss绿人数 ===
    step2Threshold: number; // 3, 2, 1, 0
    step2Data: Step2Data;

    // Step 3 Inputs
    initialGreen: number | '';
    initialMobFull: boolean;
    redPos: number;   // 0 表示未选择
    greenPos: number;   // 0 表示未选择
    startRoundNum: number | '';
    agentNames: string[];
    initialThresholds: number;
}

interface RoundInputState {
    green: number | null;
    mobFull: boolean | null;
    thresholds: number | null;
}

// ==========================================
// 3. 通用 Hooks & UI 组件
// ==========================================

function useStickyState<T>(defaultValue: T, key: string): [T, (value: T | ((val: T) => T)) => void] {
    const [value, setValue] = useState(() => {
        if (typeof window === 'undefined') return defaultValue;
        const stickyValue = window.localStorage.getItem(key);
        return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    });
    useEffect(() => {
        window.localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);
    return [value, setValue];
}

function useIsDraggable() {
    // 默认认为 >= 640px (sm) 为桌面端，支持拖拽
    const [isDraggable, setIsDraggable] = useState(typeof window !== 'undefined' ? window.innerWidth >= 640 : true);

    useEffect(() => {
        const checkDraggable = () => setIsDraggable(window.innerWidth >= 640);
        checkDraggable(); // 初始化
        window.addEventListener('resize', checkDraggable);
        return () => window.removeEventListener('resize', checkDraggable);
    }, []);

    return isDraggable;
}

const Panel = ({ title, children, className = '' }: {
    title: string,
    children: React.ReactNode,
    className?: string
}) => (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 ${className}`}>
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        </div>
        <div className="p-6">{children}</div>
    </div>
);

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-mono transition-colors text-sm";
const btnClass = "px-3 py-1.5 rounded text-sm font-medium transition-colors border select-none flex items-center justify-center gap-1";
const POSITIONS = [1, 2, 3, 4, 5];

// ==========================================
// 4. 子组件：UI 部件
// ==========================================

const HP_BARS = [
    { val: 0, color: 'bg-red-500', range: '<25%' },
    { val: 1, color: 'bg-orange-400', range: '25%~50%' },
    { val: 2, color: 'bg-yellow-400', range: '50%~75%' },
    { val: 3, color: 'bg-green-500', range: '75%~100%' },
];

function getHPRange(threshold: number | '') {
    return HP_BARS.find(b => b.val === threshold)?.range;
}

function getHPLowerBound(threshold: number) {
    switch (threshold) {
        case 1:
            return `25% (${HP_25})`;
        case 2:
            return `50% (${HP_50})`;
        case 3:
            return `75% (${HP_75})`;
        default:
            return '0%';
    }
}

function getHPUpperBound(threshold: number) {
    switch (threshold) {
        case 0:
            return `25% (${HP_25})`;
        case 1:
            return `50% (${HP_50})`;
        case 2:
            return `75% (${HP_75})`;
        case 3:
            return `100% (${HP_TOTAL})`;
        default:
            return '0%';
    }
}

// 新的血条选择组件 (无文字色块，对齐标签)
function HPBarSelector({
                           value,
                           onChange
                       }: {
    value: number,
    onChange: (val: number) => void
}) {
    return (
        <div className="mb-6 select-none">
            {/* 血条本体 */}
            <div className="flex w-full h-10 rounded-lg overflow-hidden shadow-inner border border-gray-300">
                {HP_BARS.map((bar) => {
                    const isSelected = value === bar.val;
                    return (
                        <div
                            key={bar.val}
                            onClick={() => onChange(bar.val)}
                            className={`flex-1 cursor-pointer transition-all border-r border-white/20 last:border-0 relative group ${
                                isSelected ? bar.color : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                        >
                            {isSelected &&
                                <div className="absolute inset-0 bg-white opacity-20 animate-pulse-slow"></div>}
                        </div>
                    );
                })}
            </div>

            {/* 刻度标签 - 调整为从左(0)到右(Max) */}
            <div className="relative h-6 mt-1 text-[10px] sm:text-xs text-gray-500 font-mono font-medium">
                <span className="absolute left-0 -translate-x-0 text-left">0%<br/><span
                    className="text-[9px] text-gray-400">0</span></span>
                <span className="absolute left-1/4 -translate-x-1/2 text-center">25%<br/><span
                    className="text-[9px] text-gray-400">{HP_25}</span></span>
                <span className="absolute left-2/4 -translate-x-1/2 text-center">50%<br/><span
                    className="text-[9px] text-gray-400">{HP_50}</span></span>
                <span className="absolute left-3/4 -translate-x-1/2 text-center">75%<br/><span
                    className="text-[9px] text-gray-400">{HP_75}</span></span>
                <span className="absolute right-0 translate-x-0 text-right">100%<br/><span
                    className="text-[9px] text-gray-400">{HP_TOTAL}</span></span>
            </div>
            <div className="text-center mt-2 text-xs text-gray-400">
                当前选择: <span className="font-bold text-gray-700">{getHPRange(value)}</span>
            </div>
        </div>
    );
}

// 目标值 vs 实际值 对比组件
function ComparisonWidget({ target, actual }: { target: number, actual: number }) {
    const isMatch = target === actual;
    return (
        <div className={`
            flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-300
            ${isMatch
            ? 'bg-green-50 border-green-400 text-green-900'
            : 'bg-red-50 border-red-400 text-red-900 animate-pulse'}
        `}>
            <div className="flex flex-col">
                <span className="text-xs opacity-70 uppercase font-bold tracking-wider">目标绿人 (X)</span>
                <span className="text-xl font-mono font-bold">{target}</span>
            </div>

            <div className="text-2xl font-bold px-4">
                {isMatch ? '=' : '≠'}
            </div>

            <div className="flex flex-col text-right">
                <span className="text-xs opacity-70 uppercase font-bold tracking-wider">操作结果 (Y)</span>
                <span className="text-xl font-mono font-bold">{actual}</span>
            </div>
        </div>
    );
}

// ==========================================
// 5. 子组件：密探配置 (AgentConfig)
// ==========================================
function AgentConfig({ names, setNames, onSwapPositions }: {
    names: string[],
    setNames: (n: string[]) => void,
    onSwapPositions: (idx1: number, idx2: number) => void
}) {
    const [isOpen, setIsOpen] = useState(true);
    const [swapSourceIdx, setSwapSourceIdx] = useState<number | null>(null);

    // === 使用公共 Hook ===
    const isDraggable = useIsDraggable();

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // === 修改: 点击交换逻辑 (仅在 !isDraggable 时生效) ===
    const handleCardClick = (idx: number) => {
        if (isDraggable) return; // 如果支持拖拽，禁用点击交换

        if (swapSourceIdx === null) {
            setSwapSourceIdx(idx);
        } else if (swapSourceIdx === idx) {
            setSwapSourceIdx(null); // 取消选中
        } else {
            // 执行交换
            const newNames = [...names];
            const temp = newNames[swapSourceIdx];
            newNames[swapSourceIdx] = newNames[idx];
            newNames[idx] = temp;
            setNames(newNames);
            onSwapPositions(swapSourceIdx + 1, idx + 1);
            setSwapSourceIdx(null);
        }
    };

    const handleDragEnd = () => {
        const idx1 = dragItem.current;
        const idx2 = dragOverItem.current;
        if (idx1 !== null && idx2 !== null && idx1 !== idx2) {
            const newNames = [...names];
            const temp = newNames[idx1];
            newNames[idx1] = newNames[idx2];
            newNames[idx2] = temp;
            setNames(newNames);
            onSwapPositions(idx1 + 1, idx2 + 1);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
        const target = e.currentTarget;
        if (e.key === 'ArrowRight' && target.selectionStart === target.value.length) {
            e.preventDefault();
            inputRefs.current[(idx + 1) % 5]?.focus();
        } else if (e.key === 'ArrowLeft' && target.selectionStart === 0) {
            e.preventDefault();
            inputRefs.current[(idx - 1 + 5) % 5]?.focus();
        }
    };

    return (
        <Panel title="🕵️ 密探配置" className="border-indigo-100">
            <button onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex justify-between text-xs text-gray-400 mb-2">
                {/* 根据模式显示不同的提示文案 */}
                <span>
                    {isDraggable ? '拖拽卡片交换位置' : '点击2个卡片交换位置'} • 方向键切换焦点
                </span>
                <span>{isOpen ? '收起' : '展开'}</span>
            </button>
            {isOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {names.map((name, idx) => {
                        // === 计算是否被选中 (仅在不可拖拽模式下有效) ===
                        const isSwapSelected = !isDraggable && swapSourceIdx === idx;

                        return (
                            <div
                                key={idx}
                                // === 拖拽属性绑定 ===
                                draggable={isDraggable}
                                onDragStart={isDraggable ? () => dragItem.current = idx : undefined}
                                onDragEnter={isDraggable ? () => dragOverItem.current = idx : undefined}
                                onDragEnd={isDraggable ? handleDragEnd : undefined}
                                onDragOver={isDraggable ? e => e.preventDefault() : undefined}
                                // === 点击绑定 ===
                                onClick={(e) => {
                                    // 防止点击 input 时触发交换
                                    if (e.target instanceof HTMLInputElement) return;
                                    // 仅在不支持拖拽时触发
                                    if (!isDraggable) handleCardClick(idx);
                                }}
                                className={`flex flex-col gap-1 transition-all rounded p-1 select-none
                                    ${/* 鼠标样式 */ isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                                    ${/* 选中样式 */ isSwapSelected
                                    ? 'bg-indigo-100 ring-2 ring-indigo-500 scale-95'
                                    : 'hover:bg-gray-50 active:scale-95'}
                                `}
                            >
                                <label
                                    className="text-xs text-gray-500 text-center font-bold bg-gray-100 rounded py-1 border border-transparent hover:border-indigo-300">
                                    {idx + 1}号位
                                </label>
                                <input
                                    ref={(el) => {
                                        inputRefs.current[idx] = el;
                                    }}
                                    type="text"
                                    maxLength={4}
                                    placeholder="未命名"
                                    value={name}
                                    onChange={(e) => {
                                        const newNames = [...names];
                                        newNames[idx] = e.target.value;
                                        setNames(newNames);
                                    }}
                                    onKeyDown={(e) => handleKeyDown(e, idx)}
                                    // 防止输入框的点击事件冒泡触发外层 div 的 onClick
                                    onClick={(e) => e.stopPropagation()}
                                    className={`${inputClass} text-xs px-1`}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}

const getPosLabel = (agentNames: string[], p: number | 'red' | 'green') => {
    if (p === 'red') return '红密探';
    if (p === 'green') return '绿密探';
    const name = agentNames[p - 1];
    return name ? `${p}号位(${name})` : `${p}号位`;
}

// ==========================================
// 6. 子组件：红绿密探选择器
// ==========================================
function RedGreenSelector({ redPos, greenPos, onRedChange, onGreenChange, agentNames }: {
    redPos: number | '',
    greenPos: number | '',
    onRedChange: (v: number) => void,
    onGreenChange: (v: number) => void,
    agentNames: string[]
}) {
    return (
        <div
            className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm whitespace-nowrap">📍 关键位置设定</h3>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <div className="flex items-center gap-2 flex-1">
                    <div className="size-3 rounded-full bg-red-500 shrink-0 shadow-sm"></div>
                    <select
                        value={redPos}
                        onChange={e => onRedChange(Number(e.target.value))}
                        className={`${inputClass} flex-1 min-w-[120px] bg-red-50 border-red-100 focus:ring-red-200`}
                    >
                        <option value={0}>红密探...</option>
                        {POSITIONS.map(p => <option key={p} value={p}>{getPosLabel(agentNames, p)}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2 flex-1">
                    <div className="size-3 rounded-full bg-green-500 shrink-0 shadow-sm"></div>
                    <select
                        value={greenPos}
                        onChange={e => onGreenChange(Number(e.target.value))}
                        className={`${inputClass} flex-1 min-w-[120px] bg-green-50 border-green-100 focus:ring-green-200`}
                    >
                        <option value={0}>绿密探...</option>
                        {POSITIONS.map(p => <option key={p} value={p}>{getPosLabel(agentNames, p)}</option>)}
                    </select>
                </div>
            </div>
        </div>
    );
}

// 1. 辅助函数: 按位置(1-5)分组操作, 解析红绿密探
interface OpViewItem {
    order: number;
    type: ActionType;
    killMob: boolean;
    isGeneric: boolean; // 是否来自 'red'/'green' 泛指
}

function groupOpsByPos(ops: Operation[], redPos: number, greenPos: number) {
    const res: Record<number, OpViewItem[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    ops.forEach((op, idx) => {
        let p = op.position;
        let isGeneric = false;
        // 解析泛指位置
        if (p === 'red') {
            p = Number(redPos);
            isGeneric = true;
        } else if (p === 'green') {
            p = Number(greenPos);
            isGeneric = true;
        }

        // 只有有效的位置(1-5)才加入
        if (typeof p === 'number' && res[p]) {
            res[p].push({
                order: idx + 1,
                type: op.type,
                killMob: op.killMob,
                isGeneric
            });
        }
    });
    return res;
}

// 2. 新增组件: 操作可视化表格 (用于 OperationsEditor 上方)
function OpsTableVisualization({ ops, redPos, greenPos, agentNames }: {
    ops: Operation[],
    redPos: number,
    greenPos: number,
    agentNames: string[]
}) {
    const grouped = groupOpsByPos(ops, redPos, greenPos);

    return (
        <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 text-xs shadow-sm">
            {/* 表头 */}
            <div className="grid grid-cols-5 divide-x divide-gray-200 bg-gray-50 border-b border-gray-200">
                {[1, 2, 3, 4, 5].map(i => {
                    const isRed = i === Number(redPos);
                    const isGreen = i === Number(greenPos);
                    return (
                        <div key={i} className={`
                            p-2 text-center font-bold truncate transition-colors
                            ${isRed ? 'bg-red-100 text-red-800' : ''}
                            ${isGreen ? 'bg-green-100 text-green-800' : 'text-gray-600'}
                        `}>
                            {getPosLabel(agentNames, i)}
                        </div>
                    );
                })}
            </div>
            {/* 内容 */}
            <div className="grid grid-cols-5 divide-x divide-gray-200 bg-white">
                {[1, 2, 3, 4, 5].map(i => {
                    const items = grouped[i];
                    const isRed = i === Number(redPos);
                    const isGreen = i === Number(greenPos);
                    return (
                        <div key={i} className={`
                            p-2 flex flex-col gap-1.5 items-center min-h-[3rem]
                            ${isRed ? 'bg-red-50/30' : ''} 
                            ${isGreen ? 'bg-green-50/30' : ''}
                        `}>
                            {items.map((item, idx) => (
                                <span key={idx} className={`
                                    px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold shadow-sm whitespace-nowrap
                                    ${item.isGeneric
                                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'  // 泛指操作样式
                                    : 'border-gray-200 bg-white text-gray-700'}
                                `}>
                                    {item.order}{item.type}{item.killMob && <span className="text-red-500">*</span>}
                                </span>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ==========================================
// 7. 子组件：沙盘编辑器 (通用)
// ==========================================
function OperationsEditor({
                              operations,
                              onChange,
                              onKillOpChange,
                              killOpId,
                              redPos,
                              greenPos,
                              agentNames,
                              enableKillMob,
                              simulationSteps,
                              onUndo,
                              onClear
                          }: {
    operations: Operation[],
    onChange: (ops: Operation[]) => void,
    onKillOpChange?: (id: string) => void,
    killOpId?: string,
    redPos: number,
    greenPos: number,
    agentNames: string[],
    enableKillMob: boolean,
    simulationSteps?: number[],
    onUndo?: () => void,
    onClear?: () => void
}) {
    const [swapSourceIdx, setSwapSourceIdx] = useState<number | null>(null);
    // === 修改 1: 使用 expandedOpId 替代 editingState，控制唯一展开行 ===
    const [expandedOpId, setExpandedOpId] = useState<string | null>(null);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const isDraggable = useIsDraggable();

    // === 修改 2: 点击外部（非展开Body区域）关闭展开 ===
    useEffect(() => {
        const handleGlobalClick = () => setExpandedOpId(null);
        if (expandedOpId) {
            window.addEventListener('click', handleGlobalClick);
        }
        return () => window.removeEventListener('click', handleGlobalClick);
    }, [expandedOpId]);

    // === 提取公共逻辑: 移动操作 ===
    const moveOp = (fromIdx: number, toIdx: number) => {
        if (fromIdx === toIdx) return;
        const newOps = [...operations];
        const [moved] = newOps.splice(fromIdx, 1);
        newOps.splice(toIdx, 0, moved);
        onChange(newOps);
    };

    const handleAddDefault = () => {
        const newOp: Operation = {
            id: Date.now().toString() + Math.random(),
            position: 1,
            type: 'A',
            killMob: false,
        };
        onChange([...operations, newOp]);
    };

    const removeOperation = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onChange(operations.filter(o => o.id !== id));
        if (swapSourceIdx !== null) setSwapSourceIdx(null);
    };

    const updateOperation = (id: string, updates: Partial<Operation>) => {
        onChange(operations.map(o => o.id === id ? { ...o, ...updates } : o));
    };

    // === 点击交换逻辑 (仅在 !isDraggable 时生效) ===
    const handleRowClick = (index: number) => {
        if (isDraggable) return;

        if (swapSourceIdx === null) {
            setSwapSourceIdx(index);
        } else if (swapSourceIdx === index) {
            setSwapSourceIdx(null);
        } else {
            moveOp(swapSourceIdx, index);
            setSwapSourceIdx(null);
        }
    };

    // === 拖拽排序逻辑 (仅在 isDraggable 时生效) ===
    const handleDragSort = () => {
        const idx1 = dragItem.current;
        const idx2 = dragOverItem.current;
        if (idx1 !== null && idx2 !== null) {
            moveOp(idx1, idx2);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    // === 处理展开/收起 ===
    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // 阻止冒泡，防止触发 Row Swap 或 全局关闭
        setExpandedOpId(prev => prev === id ? null : id);
    };

    return (
        <div className="mt-4">
            <OpsTableVisualization ops={operations} redPos={redPos} greenPos={greenPos} agentNames={agentNames}/>

            <div className="space-y-2 mb-4">
                {operations.map((op, index) => {
                    const realPos = op.position === 'red' ? Number(redPos) : (op.position === 'green' ? Number(greenPos) : op.position);
                    const isRedTarget = realPos === Number(redPos);
                    const isGreenTarget = realPos === Number(greenPos);

                    let isKillActive = false;
                    let onKillClick = (e: React.MouseEvent) => {
                        e.stopPropagation();
                    };
                    const showKillBadge = !!onKillOpChange || enableKillMob;

                    if (onKillOpChange) {
                        isKillActive = killOpId === op.id;
                        onKillClick = (e) => {
                            e.stopPropagation();
                            onKillOpChange(op.id);
                        };
                    } else if (enableKillMob) {
                        isKillActive = op.killMob;
                        onKillClick = (e) => {
                            e.stopPropagation();
                            onChange(operations.map(o => o.id === op.id ? { ...o, killMob: !o.killMob } : o));
                        };
                    }

                    // 计算状态
                    const isSwapSelected = !isDraggable && swapSourceIdx === index;
                    const isExpanded = expandedOpId === op.id;

                    return (
                        <div
                            key={op.id}
                            draggable={isDraggable}
                            onDragStart={isDraggable ? () => dragItem.current = index : undefined}
                            onDragEnter={isDraggable ? () => dragOverItem.current = index : undefined}
                            onDragEnd={isDraggable ? handleDragSort : undefined}
                            onDragOver={isDraggable ? e => e.preventDefault() : undefined}
                            // 点击行触发交换逻辑 (非拖拽模式)
                            onClick={!isDraggable ? () => handleRowClick(index) : undefined}
                            className={`flex flex-col border rounded transition-all select-none overflow-hidden
                                ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                                ${isSwapSelected
                                ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200'
                                : isExpanded ? 'border-indigo-200 shadow-sm bg-white' : 'bg-white border-gray-200 hover:shadow-sm'}
                            `}
                        >
                            {/* === 列表行头部 (显示摘要) === */}
                            <div className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2">
                                <span className="text-gray-300 text-[10px] sm:text-xs w-3 sm:w-4 text-center shrink-0">
                                    {index + 1}
                                </span>

                                {showKillBadge && (
                                    <div onClick={onKillClick}
                                         className={`shrink-0 cursor-pointer text-[10px] px-1.5 py-0.5 rounded border select-none transition-colors ${isKillActive ? 'bg-orange-500 text-white border-orange-600 font-bold' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}`}>
                                        KILL
                                    </div>
                                )}

                                {/* 点击 Badge 触发展开 */}
                                <div onClick={(e) => toggleExpand(e, op.id)}>
                                    <span
                                        className={`inline-block text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-bold truncate max-w-[4rem] sm:max-w-none hover:opacity-80 border border-transparent 
                                        ${isRedTarget ? 'bg-red-100 text-red-700' : isGreenTarget ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}
                                        ${isExpanded ? 'ring-2 ring-indigo-400' : ''}
                                    `}>
                                        {getPosLabel(agentNames, op.position)}
                                    </span>
                                </div>

                                {/* 点击 Badge 触发展开 */}
                                <div onClick={(e) => toggleExpand(e, op.id)}>
                                    <span
                                        className={`inline-block text-xs sm:text-sm font-mono font-bold text-gray-800 px-2 py-0.5 rounded hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors ${isExpanded ? 'bg-gray-100 border-indigo-400' : ''}`}>
                                        {op.type}
                                    </span>
                                </div>

                                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                                    {simulationSteps && simulationSteps[index] !== undefined && (
                                        <div
                                            className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 min-w-[2.5rem] justify-center font-mono font-bold">
                                            <span className="opacity-50 font-normal">→</span>
                                            {simulationSteps[index]}
                                        </div>
                                    )}
                                    <button onClick={(e) => removeOperation(e, op.id)}
                                            className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors text-lg leading-none">
                                        ×
                                    </button>
                                </div>
                            </div>

                            {/* === 展开 Body (修改区域) === */}
                            {isExpanded && (
                                <div
                                    // 阻止冒泡，确保点击Body内部不触发全局关闭，也不触发行的Swap逻辑
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-3 bg-gray-50 border-t border-gray-100 animate-fade-in cursor-default"
                                >
                                    <div className="flex flex-col gap-3">
                                        {/* 1. 修改密探 */}
                                        <div className="flex flex-col gap-2">
                                            <div
                                                className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                1. 修改密探
                                            </div>
                                            <div className="flex gap-2">
                                                {(['red', 'green'] as const).map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => updateOperation(op.id, { position: p })}
                                                        className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-all whitespace-nowrap
                                                            ${op.position === p
                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-white hover:border-indigo-300'}
                                                        `}
                                                    >
                                                        {getPosLabel(agentNames, p)}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-5 gap-2">
                                                {[1, 2, 3, 4, 5].map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => updateOperation(op.id, { position: p })}
                                                        className={`aspect-square flex items-center justify-center text-xs font-bold rounded-lg border transition-all
                                                            ${op.position === p
                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-white hover:border-indigo-300'}
                                                        `}
                                                    >
                                                        {p}{agentNames[p - 1] === '' ? '' : `: ${agentNames[p - 1]}`}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-200/50"></div>

                                        {/* 2. 修改操作 */}
                                        <div className="flex flex-col gap-2">
                                            <div
                                                className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                2. 修改操作
                                            </div>
                                            <div className="flex gap-2">
                                                {(['A', '↑', '↓', '圈'] as const).map(t => (
                                                    <button
                                                        key={t}
                                                        onClick={() => updateOperation(op.id, { type: t })}
                                                        className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all
                                                            ${op.type === t
                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-white hover:border-indigo-300'}
                                                        `}
                                                    >
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}

                {operations.length === 0 && (
                    <div
                        className="text-center py-6 text-sm text-gray-400 italic bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                        暂无操作，请添加
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <div className="flex gap-2 mr-auto">
                    {onUndo && <button onClick={onUndo}
                                       className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 hover:text-indigo-600 transition-colors flex items-center gap-1">
                        <span>↩</span> 撤回</button>}
                    {onClear && operations.length > 0 && <button onClick={onClear}
                                                                 className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">清空</button>}
                </div>
                <button onClick={handleAddDefault}
                        className="pl-3 pr-4 py-1.5 text-sm font-bold text-white bg-indigo-600 rounded shadow-sm hover:bg-indigo-700 hover:shadow active:scale-95 transition-all flex items-center gap-1">
                    <span className="text-lg leading-none mb-0.5">+</span> 添加操作
                </button>
            </div>

            <div className="text-[10px] text-gray-400 mt-2 text-right">
                {isDraggable ? '💡 拖拽行可调整顺序' : '💡 点击行进行交换'} • 点击“KILL”、“操作”或“位置”可修改
            </div>
        </div>
    );
}

// ==========================================
// 8. 子组件：Step 3 单个回合 (RoundPanel)
// ==========================================

function RoundPanel({
                        roundIndex,
                        roundData,
                        globalConfig,
                        inputState,
                        isExpanded,
                        onToggleExpand,
                        onUpdateRound,
                        onUndoRound,
                        onDeleteRound
                    }: {
    roundIndex: number,
    roundData: RoundData,
    globalConfig: GlobalConfig,
    inputState: RoundInputState,
    isExpanded: boolean,
    onToggleExpand: () => void,
    onUpdateRound: (newData: RoundData) => void,
    onUndoRound: () => void,
    onDeleteRound: () => void
}) {
    const { green, mobFull, thresholds } = inputState;
    const canCalculate = green !== null && mobFull !== null && thresholds !== null;

    const tableData = useMemo(() => {
        if (!canCalculate) return [];
        const startState = new State(green!, !mobFull);

        return [0, 1, 2, 3].map((strategyIdx) => {
            const nextSt = getNextState(startState, strategyIdx);
            const deltas = getDeltas(startState, nextSt);

            let label = "";
            const subLabel = "";
            if (strategyIdx === 0) {
                // 根据剩余 threshold 数量显示文字，略过...
                label = "不打下";
            } else {
                label = `打下${strategyIdx}个阈值`;
            }

            const disabled = strategyIdx > thresholds!;
            return { index: strategyIdx, label, subLabel, deltas, nextCount: nextSt.count, disabled };
        });
    }, [green, mobFull, thresholds, canCalculate]);

    const simulationSteps = useMemo(() => {
        if (!canCalculate || globalConfig.redPos === 0 || globalConfig.greenPos === 0) return [];
        return simulateOperations(green!, mobFull!, roundData.operations, Number(globalConfig.redPos), Number(globalConfig.greenPos));
    }, [green, mobFull, roundData.operations, globalConfig.redPos, globalConfig.greenPos, canCalculate]);

    const simulationResult = simulationSteps.length > 0 ? simulationSteps[simulationSteps.length - 1] : null;

    const handleStrategySelect = (idx: number) => {
        if (tableData[idx].disabled) return;
        onUpdateRound({ ...roundData, selectedStrategyIdx: idx });
    };

    const handleClearOps = () => {
        if (roundData.operations.length > 0 && window.confirm("确定清空本回合操作？")) {
            onUpdateRound({ ...roundData, operations: [] });
        }
    };

    const renderDelta = (deltas: string[]) => (
        <div className="flex flex-col items-center">
            {deltas.map((d, i) => (
                <span key={i}
                      className={d.startsWith('+') ? 'text-red-600 font-bold' : 'text-blue-600 font-medium'}>{d}</span>
            ))}
        </div>
    );

    return (
        <div className="border border-gray-200 rounded-lg mb-4 overflow-hidden shadow-sm transition-all group">
            {/* Header */}
            <div
                className={`px-4 py-3 flex justify-between items-center cursor-pointer select-none transition-colors ${isExpanded ? 'bg-indigo-50 border-b border-indigo-100' : 'bg-white hover:bg-gray-50'}`}
                onClick={onToggleExpand}
            >
                <div className="flex items-center gap-2 sm:gap-3 flex-1 overflow-hidden">
                    {/* 1. 圆圈序号 (始终显示, shrink-0) */}
                    <span
                        className={`shrink-0 flex items-center justify-center size-6 sm:size-7 rounded-full text-xs sm:text-sm font-bold ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {Number(globalConfig.startRoundNum || 0) + roundIndex}
                    </span>
                    {/* 2. 回合标题 (移动端隐藏 "第X回合") */}
                    <span className="hidden sm:block font-bold text-gray-800 text-lg whitespace-nowrap">
                        第 {Number(globalConfig.startRoundNum || 0) + roundIndex} 回合
                    </span>
                    {!canCalculate && <span className="text-sm text-red-400">(等待上一回合数据)</span>}
                    {canCalculate && (
                        <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ml-0 sm:ml-2">
                            {/* 4. 绿人 Badge: 移动端只显示数字 */}
                            <span
                                className="bg-green-100 text-green-800 px-1.5 sm:px-2 py-0.5 rounded border border-green-200 font-medium whitespace-nowrap">
                                <span className="hidden sm:inline">绿人: </span>{green}
                            </span>

                            {/* 5. 小怪 Badge: 移动端精简文案 */}
                            <span
                                className={`px-1.5 sm:px-2 py-0.5 rounded border font-medium whitespace-nowrap ${mobFull ? 'bg-red-100 text-red-800 border-red-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>
                                <span className="hidden sm:inline">{mobFull ? '小怪满能量' : '小怪未满能'}</span>
                                <span className="sm:hidden">{mobFull ? '满' : '未满'}</span>
                            </span>

                            {/* 6. 血量 Badge: 不精简，但防止被压缩 (shrink-0) */}
                            <span
                                className="shrink-0 bg-gray-100 text-gray-600 px-1.5 sm:px-2 py-0.5 rounded border border-gray-200 text-[10px] sm:text-xs flex items-center">
                                {getHPRange(thresholds)}
                            </span>
                        </div>
                    )}
                </div>
                {/* 右侧操作区：shrink-0 保护按钮 */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRound();
                        }}
                        // 增大一点移动端的点击区域
                        className="text-gray-300 hover:text-red-500 p-1 sm:p-1 rounded hover:bg-red-50 transition-colors text-lg"
                        title="删除回合"
                    >
                        ×
                    </button>
                    <div className="text-gray-400 text-sm font-medium">{isExpanded ? '▲' : '▼'}</div>
                </div>
            </div>

            {isExpanded && canCalculate && (
                <div className="p-5 bg-white animate-fade-in">
                    {/* 策略选择 */}
                    <div className="mb-8">
                        <div className="flex justify-between items-end mb-2">
                            <h4 className="text-sm font-bold text-gray-700">A. 目标选择</h4>
                            <div className="text-xs text-gray-500">红=增, 蓝=减, *=先杀1次小怪再增加的层数</div>
                        </div>
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">策略</th>
                                    <th className="px-3 py-3 text-center font-medium text-gray-500 whitespace-nowrap">增幅</th>
                                    <th className="px-3 py-3 text-center font-medium text-gray-500 whitespace-nowrap">目标(X)</th>
                                    <th className="px-3 py-3 text-center font-medium text-gray-500">选</th>
                                </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                {tableData.map((row) => (
                                    <tr
                                        key={row.index}
                                        onClick={() => handleStrategySelect(row.index)}
                                        className={`
                                                ${row.disabled ? 'bg-gray-50 opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                                ${roundData.selectedStrategyIdx === row.index ? 'bg-indigo-50' : !row.disabled && 'hover:bg-gray-50'}
                                            `}
                                    >
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                            {row.label}
                                            {row.subLabel &&
                                                <span className="ml-1 text-xs text-gray-400">{row.subLabel}</span>}
                                        </td>
                                        <td className="px-3 py-3">{renderDelta(row.deltas)}</td>
                                        <td className="px-3 py-3 font-bold text-center text-gray-900 text-base">{row.nextCount}</td>
                                        <td className="px-3 py-3 text-center">
                                            <input
                                                type="radio"
                                                checked={roundData.selectedStrategyIdx === row.index}
                                                disabled={row.disabled}
                                                onChange={() => {
                                                }}
                                                className="size-4 text-indigo-600 disabled:text-gray-300"
                                            />
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 沙盘排轴 */}
                    <div className="border-t border-gray-100 pt-6">
                        <div className="text-xs text-gray-500 mb-2">
                            💡 点亮“KILL”标记的操作为 <span className="font-bold">击杀小怪</span> 的操作。
                        </div>
                        <OperationsEditor
                            operations={roundData.operations}
                            onChange={(ops) => onUpdateRound({ ...roundData, operations: ops })}
                            redPos={globalConfig.redPos}
                            greenPos={globalConfig.greenPos}
                            agentNames={globalConfig.agentNames}
                            enableKillMob={true}
                            simulationSteps={simulationSteps}
                            onUndo={roundData.history && roundData.history.length > 0 ? onUndoRound : undefined}
                            onClear={handleClearOps}
                        />

                        {/* 结果校验 */}
                        {roundData.selectedStrategyIdx !== null && simulationResult !== null && (
                            <div className="mt-6">
                                <ComparisonWidget
                                    target={tableData[roundData.selectedStrategyIdx].nextCount}
                                    actual={simulationResult}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ==========================================
// 9. 子组件：Step 2 面板 (TransitionPanel)
// ==========================================
function TransitionPanel({
                             config,
                             setConfig
                         }: {
    config: GlobalConfig,
    setConfig: (cb: (prev: GlobalConfig) => GlobalConfig) => void
}) {
    const [isSandboxOpen, setIsSandboxOpen] = useState(true);

    const { step2OurGreen, step2BossGreen, step2Threshold, step2Data, redPos, greenPos, agentNames } = config;

    // 1. 计算 Target (基于 Boss 绿人数)
    // 规则：getNextState(State(boss绿人数, False), 血量以下阈值个数)
    const targetVal = useMemo(() => {
        if (step2BossGreen === '') return null;
        return getNextState(new State(Number(step2BossGreen), true), step2Threshold).count;
    }, [step2BossGreen, step2Threshold]);

    // 2. 计算 Actual (基于我方绿人数进行沙盘推演)
    const simulationResult = useMemo(() => {
        if (step2OurGreen === '' || redPos === 0 || greenPos === 0) return null;
        return calculateStep2Simulation(
            step2OurGreen, // 沙盘起点：我方绿人数
            step2Data.operations,
            step2Data.killOpId,
            Number(redPos),
            Number(greenPos)
        );
    }, [step2OurGreen, step2Data, redPos, greenPos]);

    return (
        <Panel title="步骤2：阶段一 转 阶段二">
            <div className="space-y-6">
                <div className="text-gray-700 mb-6">
                    打死boss第1条命时，从阶段一转阶段二。
                </div>

                {/* 1. 输入区域 */}
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 space-y-4">
                    {/* 1.1 描述 */}
                    <div className="flex items-center gap-2 mb-2">
                        <span
                            className="text-sm font-bold text-gray-800 border-l-4 border-indigo-500 pl-2">回合开始时</span>
                    </div>

                    {/* 1.2 Boss 血量 */}
                    <div>
                        <div className="text-xs text-gray-500 mb-1 ml-1">Boss 血量</div>
                        <HPBarSelector
                            value={step2Threshold}
                            onChange={(val) => setConfig(p => ({ ...p, step2Threshold: val }))}
                        />
                    </div>

                    {/* 1.3 & 1.4 绿人数输入 */}
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1 ml-1">Boss 绿人数</label>
                            <input
                                type="number"
                                value={step2BossGreen}
                                onChange={e => setConfig(p => ({
                                    ...p,
                                    step2BossGreen: e.target.value === '' ? '' : Number(e.target.value)
                                }))}
                                className={inputClass}
                                placeholder="0-19"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1 ml-1">我方绿人数</label>
                            <input
                                type="number"
                                value={step2OurGreen}
                                onChange={e => setConfig(p => ({
                                    ...p,
                                    step2OurGreen: e.target.value === '' ? '' : Number(e.target.value)
                                }))}
                                className={inputClass}
                                placeholder="0-19"
                            />
                        </div>
                    </div>
                </div>

                {/* 2. 显眼描述 (Target) */}
                {targetVal !== null && (<>
                        <div className="text-xs text-gray-500 mb-2">
                            ⚠️ 无法做到时，可提前或推迟进阶段二。
                        </div>
                        <div
                            className="text-center bg-indigo-50 border border-indigo-100 rounded-lg p-3 animate-fade-in">
                            <span className="text-gray-600 text-sm">本回合结束，我方应有 </span>
                            <span className="text-2xl font-bold text-indigo-700 mx-1">{targetVal}</span>
                            <span className="text-gray-600 text-sm">层绿人</span>
                        </div>
                    </>
                )}

                {/* 3. 沙盘推演区 (带折叠 & 自动Kill逻辑) */}
                <div className="border-t border-gray-100 pt-4 mt-2">
                    <button
                        onClick={() => setIsSandboxOpen(!isSandboxOpen)}
                        className="flex items-center justify-between w-full text-left mb-2 group select-none"
                    >
                        <h4 className="text-s font-bold text-gray-700">💡检查你的操作是否能达到目标绿人数</h4>
                        <span className="text-xs text-gray-400 group-hover:text-indigo-600 transition-colors">
                            {isSandboxOpen ? '收起 ▲' : '展开 ▼'}
                        </span>
                    </button>

                    {isSandboxOpen && (
                        <div className="animate-fade-in">
                            <div className="text-xs text-gray-500 mb-2">
                                💡 点亮“KILL”标记的操作为 <span className="font-bold">击杀boss第1条命</span> 的操作。
                            </div>

                            <OperationsEditor
                                operations={step2Data.operations}
                                // === 修改点 2: 增强 onChange 逻辑 ===
                                onChange={(ops) => setConfig(prev => {
                                    const oldOps = prev.step2Data.operations;
                                    const oldKillId = prev.step2Data.killOpId;

                                    // 判断动作类型
                                    const isAdding = ops.length > oldOps.length;
                                    const killStillExists = ops.some(o => o.id === oldKillId);

                                    // 确定新的 killOpId
                                    let nextKillId = killStillExists ? oldKillId : '';

                                    // 规则：如果是新增操作，且当前没有指定Kill操作，则自动将新操作设为Kill
                                    if (isAdding && !nextKillId) {
                                        nextKillId = ops[ops.length - 1].id;
                                    }

                                    return {
                                        ...prev,
                                        step2Data: {
                                            ...prev.step2Data,
                                            operations: ops,
                                            killOpId: nextKillId
                                        }
                                    };
                                })}
                                onKillOpChange={(id) => setConfig(p => ({
                                    ...p,
                                    step2Data: { ...p.step2Data, killOpId: id }
                                }))}
                                killOpId={step2Data.killOpId}
                                redPos={redPos}
                                greenPos={greenPos}
                                agentNames={agentNames}
                                enableKillMob={false}
                                simulationSteps={simulationResult?.steps}
                                onClear={() => {
                                    if (window.confirm("确定清空？")) {
                                        setConfig(p => ({ ...p, step2Data: { ...p.step2Data, operations: [] } }));
                                    }
                                }}
                            />

                            {/* 结果对比 (包含在折叠区内) */}
                            {targetVal !== null && simulationResult && (
                                <div className="mt-4 animate-fade-in">
                                    <ComparisonWidget
                                        target={targetVal}
                                        actual={simulationResult.actual}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Panel>
    );
}

// ==========================================
// 10. 子组件：Step 3 汇总表格
// ==========================================
function SummaryTable({ rounds, roundInputs, startRoundNum, agentNames, redPos, greenPos }: {
    rounds: RoundData[],
    roundInputs: RoundInputState[],
    startRoundNum: number,
    agentNames: string[],
    redPos: number,
    greenPos: number,
}) {
    return (
        <div className="mb-6">
            <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-800 text-white">
                    <tr>
                        <th className="px-3 py-2 text-center w-12 text-sm font-bold">#</th>
                        {POSITIONS.map(p => {
                            const isRed = p === Number(redPos);
                            const isGreen = p === Number(greenPos);
                            return (
                                <th key={p} className={`px-3 py-2 text-center min-w-[70px] ${
                                    isRed ? 'bg-red-700' : isGreen ? 'bg-green-700' : ''
                                }`}>
                                    {p}号位 <span
                                    className="opacity-75 font-normal block scale-90">{agentNames[p - 1] || '-'}</span>
                                </th>
                            );
                        })}
                        <th className="px-3 py-2 text-left min-w-[100px]">策略</th>
                        <th className="px-3 py-2 text-left min-w-[100px]">绿人</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                    {rounds.map((round, rIdx) => {
                        // === 新增：计算状态 ===
                        const roundInput = roundInputs[rIdx];
                        const input = roundInputs[rIdx];
                        let isMismatch = false;
                        const isStrategyMissing = round.selectedStrategyIdx === null; // 判断是否未选策略

                        // 只有当数据完整且选择了策略时才进行校验
                        if (input && input.green !== null && input.mobFull !== null && !isStrategyMissing) {
                            const startState = new State(input.green, !input.mobFull);
                            const targetState = getNextState(startState, round.selectedStrategyIdx!);
                            const steps = simulateOperations(input.green, input.mobFull, round.operations, Number(redPos), Number(greenPos));
                            const actual = steps.length > 0 ? steps[steps.length - 1] : input.green;
                            if (targetState.count !== actual) {
                                isMismatch = true;
                            }
                        }

                        const thresholds = roundInput.thresholds ?? 3;
                        let strategy = '未选择';
                        if (round.selectedStrategyIdx === 0) {
                            if (thresholds > 0) {
                                strategy = `不要打下${getHPLowerBound(thresholds)}`;
                            } else {
                                strategy = '';
                            }
                        }
                        if (round.selectedStrategyIdx !== null && round.selectedStrategyIdx > 0) {
                            const targetThreshold = Math.max(0, thresholds - round.selectedStrategyIdx);
                            strategy = `打下${getHPUpperBound(targetThreshold)}`;
                        }

                        const grouped = groupOpsByPos(round.operations, redPos, greenPos);

                        // === 修改：计算行背景色 ===
                        let rowClass = '';
                        if (isStrategyMissing) {
                            rowClass = 'bg-orange-50 ring-1 ring-inset ring-orange-200'; // 未选策略：橙色
                        } else if (isMismatch) {
                            rowClass = 'bg-red-100 ring-1 ring-inset ring-red-300'; // 结果不符：红色
                        } else {
                            rowClass = rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'; // 默认斑马纹
                        }

                        return (
                            <tr key={round.id} className={rowClass}>
                                <td className="px-3 py-3 text-center font-bold text-gray-500 text-sm">{startRoundNum + rIdx}</td>
                                {POSITIONS.map(pos => {
                                    const isRed = pos === Number(redPos);
                                    const isGreen = pos === Number(greenPos);
                                    const items = grouped[pos];

                                    return (
                                        <td key={pos} className={`px-2 py-2 text-center align-top ${
                                            isRed ? 'bg-red-50/30' : isGreen ? 'bg-green-50/30' : ''
                                        }`}>
                                            <div className="flex flex-col gap-1 items-center">
                                                {items.map((item, idx) => (
                                                    <span key={idx} className={`
                                                        inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow-sm whitespace-nowrap border
                                                        ${item.isGeneric
                                                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                                        : 'border-gray-200 bg-white text-gray-700'}
                                                    `}>
                                                        {item.order}{item.type}{item.killMob &&
                                                        <span className="text-red-500">*</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    );
                                })}
                                <td className={`px-3 py-3 text-sm ${isStrategyMissing ? 'text-orange-700 font-bold' : 'text-gray-600'}`}>
                                    {strategy}
                                    {isMismatch && <span className="ml-2 text-red-600 font-bold"
                                                         title="操作结果与目标不符">⚠️</span>}
                                </td>
                                <td className={`px-3 py-3 text-sm ${isMismatch ? 'text-red-700 font-bold' : 'text-gray-600'}`}>
                                    {roundInput.green}
                                </td>
                            </tr>
                        );
                    })}
                    {rounds.length === 0 && <tr>
                        <td colSpan={7} className="p-4 text-center text-gray-400">暂无回合数据</td>
                    </tr>}
                    </tbody>
                </table>
            </div>
            {/* === 新增：脚注说明 === */}
            <div className="mt-2 text-[10px] sm:text-xs text-gray-500 flex justify-end gap-4">
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-orange-50 border border-orange-200 rounded block"></span>
                    <span>未选策略</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-red-100 border border-red-300 rounded block"></span>
                    <span>操作无法做到要求绿人数</span>
                </div>
            </div>
        </div>
    );
}


// ==========================================
// 11. 主组件
// ==========================================
export default function YiZhanGuanTou() {
    const [config, setConfig] = useStickyState<GlobalConfig>({
        step2OurGreen: '',
        step2BossGreen: '', // === 新增: 默认为空 ===
        step2Threshold: 3,
        step2Data: { operations: [], killOpId: '' },
        initialGreen: '',
        initialMobFull: false,
        redPos: 0,
        greenPos: 0,
        startRoundNum: 1,
        agentNames: ['', '', '', '', ''],
        initialThresholds: 3
    }, 'yizhan-config-v6');

    const [rounds, setRounds] = useStickyState<RoundData[]>([], 'yizhan-rounds-v6');
    const [roundsHistory, setRoundsHistory] = useStickyState<RoundData[][]>([], 'yizhan-rounds-history-v2');
    const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);

    // 定义导出逻辑 (纯逻辑)
    const handleExport = () => {
        const data = {
            config,
            rounds,
            roundsHistory,
            version: 'v6',
            timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `yizhan-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 定义导入逻辑 (接收 JSON 字符串)
    const handleImport = (jsonContent: string) => {
        try {
            const json = JSON.parse(jsonContent);
            if (json.config && json.rounds) {
                if (window.confirm("导入将覆盖当前所有数据，确定继续吗？")) {
                    setConfig(json.config);
                    setRounds(json.rounds);
                    setRoundsHistory(json.roundsHistory || []);
                    alert("导入成功！");
                }
            } else {
                alert("文件格式不正确，缺少关键数据。");
            }
        } catch (err) {
            alert("无法解析 JSON 文件。");
        }
    };

    useLevelToolbar({
        onExport: handleExport,
        onImport: handleImport
    });

    // ... (状态链计算 roundInputs 保持不变)
    const roundInputs = useMemo(() => {
        const inputs: RoundInputState[] = [];
        let currentGreen = config.initialGreen === '' ? null : Number(config.initialGreen);
        let currentMobFull = config.initialMobFull;
        let currentThresholds = config.initialThresholds;

        inputs.push({ green: currentGreen, mobFull: currentMobFull, thresholds: currentThresholds });

        for (let i = 0; i < rounds.length; i++) {
            const round = rounds[i];
            if (currentGreen !== null && round.selectedStrategyIdx !== null) {
                const startState = new State(currentGreen, !currentMobFull);
                const nextSt = getNextState(startState, round.selectedStrategyIdx);
                currentGreen = nextSt.count;
                currentMobFull = !currentMobFull;
                let nextThresholds = currentThresholds - round.selectedStrategyIdx;
                if (nextThresholds < 0) nextThresholds = 0;
                currentThresholds = nextThresholds;
                inputs.push({ green: currentGreen, mobFull: currentMobFull, thresholds: currentThresholds });
            } else {
                currentGreen = null;
                inputs.push({ green: null, mobFull: null, thresholds: null });
            }
        }
        return inputs;
    }, [config.initialGreen, config.initialMobFull, config.initialThresholds, rounds]);

    // ... (历史管理函数 pushGlobalHistory, handleGlobalUndo, addRound, deleteRound, handleUpdateRound, handleUndoRound, handleSwapPositions 保持不变)
    const pushGlobalHistory = (currentRounds: RoundData[]) => {
        setRoundsHistory(prev => [...prev, currentRounds].slice(-10));
    };
    const handleGlobalUndo = () => {
        setRoundsHistory(prev => {
            const newHistory = [...prev];
            const lastState = newHistory.pop();
            if (lastState) setRounds(lastState);
            return newHistory;
        });
    };
    const addRound = () => {
        const newRound: RoundData = {
            id: Date.now().toString(),
            operations: [],
            selectedStrategyIdx: null,
            history: [],
        };
        setRounds(prev => [...prev, newRound]);
        setExpandedRoundId(newRound.id);
    };
    const deleteRound = (idx: number) => {
        if (window.confirm("确定删除该回合吗？")) {
            pushGlobalHistory(rounds);
            setRounds(prev => prev.filter((_, i) => i !== idx));
        }
    };
    const handleUpdateRound = (idx: number, newData: RoundData) => {
        setRounds(prev => {
            const newRounds = [...prev];
            const oldRound = newRounds[idx];
            const snapshot: RoundSnapshot = {
                operations: oldRound.operations,
                selectedStrategyIdx: oldRound.selectedStrategyIdx
            };
            const newHistory = [...oldRound.history, snapshot].slice(-10);
            newRounds[idx] = { ...newData, history: newHistory };
            return newRounds;
        });
    };
    const handleUndoRound = (idx: number) => {
        setRounds(prev => {
            const newRounds = [...prev];
            const round = newRounds[idx];
            if (round.history.length === 0) return prev;
            const newHistory = [...round.history];
            const lastState = newHistory.pop()!;
            newRounds[idx] = {
                ...round,
                operations: lastState.operations,
                selectedStrategyIdx: lastState.selectedStrategyIdx,
                history: newHistory
            };
            return newRounds;
        });
    };
    const handleSwapPositions = (pos1: number, pos2: number) => {
        setConfig(prev => {
            let newRed = prev.redPos;
            let newGreen = prev.greenPos;

            // 如果红密探在交换的位置上，更新它
            if (newRed === pos1) newRed = pos2;
            else if (newRed === pos2) newRed = pos1;

            // 如果绿密探在交换的位置上，更新它
            if (newGreen === pos1) newGreen = pos2;
            else if (newGreen === pos2) newGreen = pos1;

            return { ...prev, redPos: newRed, greenPos: newGreen };
        });

        setRounds(prevRounds => prevRounds.map(round => ({
            ...round,
            operations: round.operations.map(op => {
                if (op.position === pos1) return { ...op, position: pos2 };
                if (op.position === pos2) return { ...op, position: pos1 };
                return op;
            })
        })));
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 p-2 md:p-4">
            {/* 移除：Header Area (已移至 Parent Toolbar) */}

            {/* 1. 密探位置 */}
            <AgentConfig
                names={config.agentNames}
                setNames={names => setConfig(p => ({ ...p, agentNames: names }))}
                onSwapPositions={handleSwapPositions}
            />

            {/* 2. Step 1 */}
            <Panel title="步骤1：阶段一">
                <div className="text-gray-700 mb-6">
                    正常打 Boss，保证 Boss 释放技能时，
                    <span className="font-bold text-green-700">我方绿人 ≤ 10 层</span>。
                </div>

                <div className="border-t border-gray-100 pt-4">
                    <div
                        className="text-xs  bg-orange-50 p-2 rounded border border-orange-100 mb-4 font-bold">
                        ⚠️ boss第1条命没死前，都处于阶段一。
                        在<span className="text-orange-600">回合5 boss放技能得到红绿密探后</span>再打死boss。
                    </div>

                    <RedGreenSelector
                        redPos={config.redPos}
                        greenPos={config.greenPos}
                        agentNames={config.agentNames}
                        onRedChange={v => setConfig(p => ({ ...p, redPos: v }))}
                        onGreenChange={v => setConfig(p => ({ ...p, greenPos: v }))}
                    />
                </div>
            </Panel>

            {/* 4. Step 2 */}
            <TransitionPanel config={config} setConfig={setConfig}/>

            {/* 5. Step 3 */}
            <Panel title="步骤3：阶段二 （绿人推导及操作检查）">
                {/* 1. 顶部配置区域 (保持不变) */}
                <div className="mb-8 p-5 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap gap-6 mb-4 items-center">
                        <div className="flex items-center gap-2">
                <span
                    className="text-sm font-bold  text-gray-800 border-l-4 border-indigo-500  pl-2 whitespace-nowrap">起始回合:</span>
                            {/* === 修改点 3: 优化输入框样式和逻辑 === */}
                            <input
                                type="number"
                                min={1}
                                max={99}
                                value={config.startRoundNum}
                                onChange={e => {
                                    const val = e.target.value;
                                    // === 修改点 A: 允许设置为空字符串 ===
                                    if (val === '') {
                                        setConfig(p => ({ ...p, startRoundNum: '' }));
                                    } else {
                                        const v = parseInt(val);
                                        if (!isNaN(v) && v > 0 && v < 100) setConfig(p => ({ ...p, startRoundNum: v }));
                                    }
                                }}
                                className={`${inputClass} w-16 px-1 font-bold text-lg bg-white shadow-sm`}
                                placeholder="0"
                            />
                            <span
                                className="text-sm font-bold whitespace-nowrap">，回合开始时：</span>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500 mb-1 ml-1">Boss 血量</div>
                        <HPBarSelector
                            value={config.initialThresholds}
                            onChange={v => setConfig(p => ({ ...p, initialThresholds: v }))}
                        />
                    </div>

                    <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-2">
                            <label className="block text-xs text-gray-500 mb-1 ml-1">Boss绿人数</label>
                            <input
                                type="number"
                                value={config.initialGreen}
                                onChange={e => setConfig(p => ({
                                    ...p,
                                    // === 修改点 B: 允许设置为空字符串 ===
                                    initialGreen: e.target.value === '' ? '' : Number(e.target.value)
                                }))}
                                className={inputClass} // 使用通用的 inputClass (w-full)，使其自适应宽度
                                placeholder="0-19"
                            />
                        </div>
                        <div className="w-px h-6 bg-gray-200"></div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={config.initialMobFull}
                                onChange={e => setConfig(p => ({ ...p, initialMobFull: e.target.checked }))}
                                className="size-5 text-indigo-600 rounded"
                            />
                            <span className="text-sm text-gray-700 font-medium">小怪满能量</span>
                        </label>
                    </div>
                </div>

                {/* 2. 汇总表格 (保持不变) */}
                <SummaryTable rounds={rounds} roundInputs={roundInputs}
                              startRoundNum={Number(config.startRoundNum || 0)}
                              agentNames={config.agentNames}
                              redPos={config.redPos} greenPos={config.greenPos}/>

                {/* === 修改点 1: 将回合列表移到按钮上方 === */}
                <div className="space-y-4 mb-6">
                    {rounds.map((round, idx) => (
                        <RoundPanel
                            key={round.id}
                            roundIndex={idx}
                            roundData={round}
                            globalConfig={config}
                            inputState={roundInputs[idx]}
                            isExpanded={expandedRoundId === round.id}
                            onToggleExpand={() => setExpandedRoundId(prev => prev === round.id ? null : round.id)}
                            onUpdateRound={(data) => handleUpdateRound(idx, data)}
                            onUndoRound={() => handleUndoRound(idx)}
                            onDeleteRound={() => deleteRound(idx)}
                        />
                    ))}
                </div>

                {/* === 修改点 1: 按钮栏现在在列表下方 === */}
                <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-2">
                        {roundsHistory.length > 0 && (
                            <button onClick={handleGlobalUndo}
                                    className="text-sm text-gray-500 hover:text-indigo-600 underline font-medium mr-2">
                                ↩ 撤销删除/清空
                            </button>
                        )}
                        {rounds.length > 0 && (
                            <button onClick={() => {
                                if (window.confirm("确认清空并删除所有回合？")) {
                                    pushGlobalHistory(rounds);
                                    // === 修改点 2: 直接设置为空数组，实现删除所有回合 ===
                                    setRounds([]);
                                }
                            }}
                                    className="text-sm text-red-500 hover:text-red-700 underline font-medium">
                                一键清空所有
                            </button>
                        )}
                    </div>
                    <button onClick={addRound}
                            className={`${btnClass} bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm text-sm px-4 py-2`}>
                        + 新增回合
                    </button>
                </div>
            </Panel>
        </div>
    );
}

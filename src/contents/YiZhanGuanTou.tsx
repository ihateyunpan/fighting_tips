import { useMemo, useRef, useState } from 'react';

// ==========================================
// 1. 核心逻辑与类型定义
// ==========================================

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

function getNextState(state: State, breakCount: number): State {
    const nextState = state.clone();

    // 1. 打下阈值
    for (let i = 0; i < breakCount; i++) {
        nextState.add(10);
    }

    // 2. 固定流程
    nextState.add(2);
    nextState.add(2);
    if (!nextState.is_attack) nextState.add(2);
    nextState.add(2);
    if (!nextState.is_attack) nextState.add(2);

    // 3. 切换状态
    nextState.is_attack = !nextState.is_attack;

    return nextState;
}

function getDeltas(fromState: State, toState: State): string[] {
    if (toState.count >= fromState.count) {
        return [`+${toState.count - fromState.count}`];
    }
    const ans: string[] = [];
    const delta1 = fromState.count - toState.count;
    if (delta1 < 10) ans.push(`-${delta1}`);

    const delta2 = toState.count + 20 - fromState.count;
    if (delta2 < 10) {
        ans.push(`+${delta2}`);
    } else {
        if (toState.count === 0) ans.push(fromState.count > 10 ? "+10*" : "+10");
        else if (toState.count <= 6) ans.push(`+${toState.count}*`);
    }
    return ans;
}

// === 新增：沙盘模拟逻辑 ===

type ActionType = 'A' | '↑' | '↓';
type Mode = 'EMPTY' | 'FORWARD' | 'BACKWARD';

// 修改 Operation 接口，position 支持字符串 'red' | 'green'
interface Operation {
    id: string;
    position: number | 'red' | 'green';
    type: ActionType;
    killMob: boolean;
}

// 修改模拟逻辑，增加位置解析
function simulateOperations(
    initialGreen: number,
    initialMobFull: boolean,
    ops: Operation[],
    redPos: number,
    greenPos: number
): number[] {
    const simState = new State(initialGreen, !initialMobFull);
    let mode: Mode = 'EMPTY';
    const steps: number[] = [];

    for (const op of ops) {
        // === 新增: 解析真实位置 ===
        let currentPos = op.position;
        if (currentPos === 'red') currentPos = redPos;
        else if (currentPos === 'green') currentPos = greenPos;

        // 1. 结算增益
        if (mode === 'FORWARD') {
            if (op.type === 'A') simState.add(1);
            else if (op.type === '↑') simState.add(2);
        } else if (mode === 'BACKWARD') {
            if (op.type === 'A') simState.add(-1);
            else if (op.type === '↑') simState.add(-2);
        }

        // 2. 切换模式 (使用解析后的 currentPos 判断)
        if (currentPos === redPos) {
            mode = 'FORWARD';
        } else if (currentPos === greenPos) {
            mode = 'BACKWARD';
        }

        steps.push(simState.count);
    }

    return steps;
}

// ==========================================
// 2. UI 组件
// ==========================================

function Panel({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{title}</h3>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

const inputClass = "w-full max-w-[100px] px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center font-mono";
const selectClass = "px-2 py-1.5 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-indigo-500";

const TABLE_LABELS = ["不打下75%/50%/25%", "打下1个阈值", "打下2个阈值", "打下3个阈值"];
const POSITIONS = [1, 2, 3, 4, 5];

export default function YiZhanGuanTou() {
    // --- Panel 2 States ---
    const [bossDeadGreen, setBossDeadGreen] = useState<number | ''>('');

    // --- Panel 3+4 Combined States ---
    const [p3CurrentGreen, setP3CurrentGreen] = useState<number | ''>('');
    const [p3MobFull, setP3MobFull] = useState<boolean>(false);

    // 策略选择 (0-3)
    const [selectedStrategyIdx, setSelectedStrategyIdx] = useState<number | null>(null);

    // 沙盘配置
    const [redPos, setRedPos] = useState<number | ''>('');
    const [greenPos, setGreenPos] = useState<number | ''>('');

    // 操作列表
    const [operations, setOperations] = useState<Operation[]>([]);

    // 新增操作的临时状态
    const [newOpPos, setNewOpPos] = useState<number | 'red' | 'green'>('red');
    const [newOpType, setNewOpType] = useState<ActionType>('A');
    const [newOpKill, setNewOpKill] = useState<boolean>(false);

    // --- Panel 2 Calculation ---
    const p2Result = useMemo(() => {
        if (bossDeadGreen === '') return '-';
        const startState = new State(Number(bossDeadGreen), true);
        const endState = getNextState(startState, 0);
        return endState.count;
    }, [bossDeadGreen]);

    // --- Panel 3 Data Generation ---
    const p3TableData = useMemo(() => {
        if (p3CurrentGreen === '') return [];
        const startState = new State(Number(p3CurrentGreen), !p3MobFull);
        return TABLE_LABELS.map((label, i) => {
            const nextSt = getNextState(startState, i);
            const deltas = getDeltas(startState, nextSt);
            return { label, deltas, nextCount: nextSt.count, index: i };
        });
    }, [p3CurrentGreen, p3MobFull]);

    // --- Simulation Calculation (修改) ---
    // 1. 获取完整的步骤结果数组
    const simulationSteps = useMemo(() => {
        if (p3CurrentGreen === '' || redPos === '' || greenPos === '') return [];
        return simulateOperations(
            Number(p3CurrentGreen),
            p3MobFull,
            operations,
            Number(redPos),
            Number(greenPos)
        );
    }, [p3CurrentGreen, p3MobFull, operations, redPos, greenPos]);

    // 2. 最终结果取数组最后一项
    const simulationResult = useMemo(() => {
        if (simulationSteps.length === 0) return null;
        return simulationSteps[simulationSteps.length - 1];
    }, [simulationSteps]);

    // --- Handlers ---
    const addOperation = () => {
        const newOp: Operation = {
            id: Date.now().toString() + Math.random(),
            position: newOpPos,
            type: newOpType,
            killMob: newOpKill
        };
        setOperations([...operations, newOp]);
    };

    const removeOperation = (id: string) => {
        setOperations(operations.filter(op => op.id !== id));
    };

    // 拖拽相关逻辑
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleDragStart = (index: number) => {
        dragItem.current = index;
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = () => {
        const startIdx = dragItem.current;
        const endIdx = dragOverItem.current;
        if (startIdx !== null && endIdx !== null && startIdx !== endIdx) {
            const newOps = [...operations];
            const [draggedItem] = newOps.splice(startIdx, 1);
            newOps.splice(endIdx, 0, draggedItem);
            setOperations(newOps);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    // 渲染增幅显示
    const renderDelta = (deltas: string[]) => (
        <div className="flex flex-col items-center">
            {deltas.map((d, idx) => (
                <span key={idx} className={d.startsWith('+') ? 'text-red-600 font-bold' : 'text-blue-600 font-medium'}>
                    {d}
                </span>
            ))}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Panel 1 */}
            <Panel title="步骤1：阶段一">
                <div className="text-gray-700">
                    正常打 Boss，保证 Boss 释放技能时，<span className="font-bold text-green-700">我方绿人 ≤ 10 层</span>。
                </div>
            </Panel>

            {/* Panel 2 */}
            <Panel title="步骤2：转阶段计算">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Boss死时绿人:</span>
                        <input
                            type="number"
                            value={bossDeadGreen}
                            onChange={e => setBossDeadGreen(e.target.value === '' ? '' : Number(e.target.value))}
                            className={inputClass}
                            placeholder="0-19"
                        />
                    </div>
                    <div className="text-sm text-gray-600">
                        → 下回合应为: <span className="text-2xl font-bold text-indigo-600 ml-1">{p2Result}</span> 层
                    </div>
                </div>
            </Panel>

            {/* Panel 3 Combined */}
            <Panel title="步骤3：增幅计算与排轴验证">
                {/* 基础输入 */}
                <div className="flex items-end gap-6 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">本回合绿人数量</label>
                        <input
                            type="number"
                            value={p3CurrentGreen}
                            onChange={e => setP3CurrentGreen(e.target.value === '' ? '' : Number(e.target.value))}
                            className={inputClass}
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pb-2">
                        <input
                            type="checkbox"
                            checked={p3MobFull}
                            onChange={e => setP3MobFull(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 rounded"
                        />
                        <span className="text-sm text-gray-700">小怪是否满能量</span>
                    </label>
                </div>

                {/* 策略表格 */}
                <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-700 mb-2">A. 目标选择</h4>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs text-gray-500 whitespace-nowrap">策略</th>
                                <th className="px-4 py-2 text-center text-xs text-gray-500 whitespace-nowrap">增幅</th>
                                <th className="px-4 py-2 text-center text-xs text-gray-500 whitespace-nowrap">我方绿人数目标 (X)</th>
                                <th className="px-4 py-2 text-center text-xs text-gray-500 whitespace-nowrap">选择</th>
                            </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                            {p3TableData.length > 0 ? p3TableData.map((row) => (
                                <tr
                                    key={row.index}
                                    onClick={() => setSelectedStrategyIdx(row.index)}
                                    className={`cursor-pointer transition-colors ${selectedStrategyIdx === row.index ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-gray-50'}`}
                                >
                                    <td className="px-4 py-2 text-sm text-gray-700">{row.label}</td>
                                    <td className="px-4 py-2 text-sm">{renderDelta(row.deltas)}</td>
                                    <td className="px-4 py-2 text-sm font-bold text-center text-gray-900">{row.nextCount}</td>
                                    <td className="px-4 py-2 text-center">
                                        <input
                                            type="radio"
                                            checked={selectedStrategyIdx === row.index}
                                            onChange={() => setSelectedStrategyIdx(row.index)}
                                            className="text-indigo-600 focus:ring-indigo-500"
                                        />
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4}
                                        className="p-4 text-center text-gray-400 text-sm">请先输入上方基础数据
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-2 text-xs text-gray-500 text-right">
                        <span className="text-red-600 font-medium">红色</span> - 增加层数，
                        <span className="text-blue-600 font-medium ml-1">蓝色</span> - 减少层数，
                        带 <span className="font-mono font-bold text-gray-600">[*]</span> 表示要击杀小怪后再增加层数
                    </div>
                </div>

                {/* 沙盘验证区 */}
                <div className="border-t border-gray-200 pt-6">
                    <h4 className="text-sm font-bold text-gray-700 mb-4">B. 沙盘排轴</h4>

                    {/* 配置行 */}
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="size-3 rounded-full bg-red-500"></div>
                            <span className="text-sm font-medium">红位置:</span>
                            <select
                                value={redPos}
                                onChange={e => setRedPos(Number(e.target.value))}
                                className={selectClass}
                            >
                                <option value="">选位置</option>
                                {POSITIONS.map(p => <option key={p} value={p}>{p}号</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="size-3 rounded-full bg-green-500"></div>
                            <span className="text-sm font-medium">绿位置:</span>
                            <select
                                value={greenPos}
                                onChange={e => setGreenPos(Number(e.target.value))}
                                className={selectClass}
                            >
                                <option value="">选位置</option>
                                {POSITIONS.map(p => <option key={p} value={p}>{p}号</option>)}
                            </select>
                        </div>
                    </div>

                    {/* 添加操作行 */}
                    <div
                        className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                        <span className="text-xs text-gray-500">添加操作:</span>
                        <select
                            value={newOpPos}
                            onChange={e => {
                                const val = e.target.value;
                                // 如果是 red/green 则存字符串，否则转数字
                                setNewOpPos((val === 'red' || val === 'green') ? val : Number(val));
                            }}
                            className={selectClass}
                        >
                            <option value="red">红密探</option>
                            <option value="green">绿密探</option>
                            <option disabled>──────────</option>
                            {POSITIONS.map(p => <option key={p} value={p}>{p}号位</option>)}
                        </select>
                        <select
                            value={newOpType}
                            onChange={e => setNewOpType(e.target.value as ActionType)}
                            className={selectClass}
                        >
                            <option value="A">普攻 (A)</option>
                            <option value="↑">技能 (↑)</option>
                            <option value="↓">防御 (↓)</option>
                        </select>
                        <label className="flex items-center gap-1 cursor-pointer mx-2">
                            <input
                                type="checkbox"
                                checked={newOpKill}
                                onChange={e => setNewOpKill(e.target.checked)}
                            />
                            <span className="text-xs">击杀小怪</span>
                        </label>
                        <button
                            onClick={addOperation}
                            disabled={redPos === '' || greenPos === ''}
                            className={`px-3 py-1.5 rounded text-xs font-bold text-white transition-all ${
                                (redPos === '' || greenPos === '')
                                    ? 'bg-gray-300 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                            }`}
                        >
                            + 添加
                        </button>
                    </div>

                    {/* 可视化轴 (5列) */}
                    <div className="mb-6 overflow-x-auto">
                        <div className="flex min-w-[300px] border border-gray-200 rounded-lg overflow-hidden">
                            {POSITIONS.map(pos => {
                                const isRed = Number(redPos) === pos;
                                const isGreen = Number(greenPos) === pos;
                                const bgClass = isRed ? 'bg-red-50' : isGreen ? 'bg-green-50' : 'bg-white';
                                const headerColor = isRed ? 'text-red-700' : isGreen ? 'text-green-700' : 'text-gray-500';

                                return (
                                    <div key={pos}
                                         className={`flex-1 flex flex-col min-w-[60px] border-r border-gray-100 last:border-0 ${bgClass}`}>
                                        <div
                                            className={`text-center py-2 text-xs font-bold border-b border-gray-200/50 ${headerColor}`}>
                                            {pos}号位
                                        </div>
                                        <div className="p-2 space-y-2 min-h-[100px]">
                                            {operations.map((op, idx) => {
                                                // === 修改: 解析位置用于判断是否渲染在当前列 ===
                                                const resolvedPos = op.position === 'red' ? Number(redPos) : (op.position === 'green' ? Number(greenPos) : op.position);

                                                if (resolvedPos !== pos) return null;

                                                return (
                                                    <div key={op.id} className="text-center">
                                                        <span
                                                            className={`inline-block px-2 py-1 border rounded shadow-sm text-xs font-mono ${
                                                                // 给密探操作加点特殊样式区分
                                                                (op.position === 'red' || op.position === 'green') ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'
                                                            }`}>
                                                            {idx + 1}{op.type}
                                                            {op.killMob &&
                                                                <span className="text-red-500 ml-0.5">*</span>}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 结果对比 */}
                    {selectedStrategyIdx !== null && simulationResult !== null && (
                        <div className={`p-4 rounded-lg border flex items-center justify-between ${
                            p3TableData[selectedStrategyIdx].nextCount === simulationResult
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                        }`}>
                            <div className="flex flex-col">
                                <span className="text-xs opacity-70">目标 (X)</span>
                                <span className="text-2xl font-bold">{p3TableData[selectedStrategyIdx].nextCount}</span>
                            </div>

                            <div className="text-xl font-bold">vs</div>

                            <div className="flex flex-col text-right">
                                <span className="text-xs opacity-70">模拟结果 (Y)</span>
                                <span className="text-2xl font-bold">{simulationResult}</span>
                            </div>
                        </div>
                    )}
                    {selectedStrategyIdx !== null && simulationResult !== null && p3TableData[selectedStrategyIdx].nextCount !== simulationResult && (
                        <div className="mt-2 text-xs text-red-600 font-bold text-center animate-bounce">
                            ⚠️ 结果不匹配，请调整操作顺序或策略
                        </div>
                    )}

                    {/* 可拖拽操作列表 (编辑模式) */}
                    <div className="mt-6">
                        <h5 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">操作序列
                            (拖动调整)</h5>
                        {operations.length > 0 && (
                            <button
                                onClick={() => setOperations([])}
                                className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                            >
                                清空全部
                            </button>
                        )}
                        <div className="space-y-2">
                            {operations.map((op, index) => (
                                <div
                                    key={op.id}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragEnter={() => handleDragEnter(index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="flex items-center gap-3 bg-white border border-gray-200 p-2 rounded cursor-move hover:shadow-md transition-shadow select-none active:bg-gray-50"
                                >
                                    <span className="text-gray-400 text-xs w-4 text-center">{index + 1}</span>
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                        // 样式判断逻辑：如果是 'red' 或解析后是 redPos -> 红色
                                        (op.position === 'red' || op.position === Number(redPos)) ? 'bg-red-100 text-red-700' :
                                            (op.position === 'green' || op.position === Number(greenPos)) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                    }`}>
                                        {op.position === 'red' ? '红密探' : (op.position === 'green' ? '绿密探' : `${op.position}号`)}
                                    </span>
                                    <span className="text-sm font-mono font-bold text-gray-800">{op.type}</span>
                                    {op.killMob && <span
                                        className="text-xs text-red-500 border border-red-200 px-1 rounded">杀怪</span>}

                                    {simulationSteps[index] !== undefined && (
                                        <div
                                            className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-indigo-50 rounded text-xs text-indigo-700 border border-indigo-100">
                                            <span>→</span>
                                            <span className="font-bold">{simulationSteps[index]}</span>
                                            <span className="scale-75 opacity-70">层</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => removeOperation(op.id)}
                                        className="ml-auto text-gray-400 hover:text-red-500"
                                        title="删除"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            {operations.length === 0 && (
                                <div
                                    className="text-center py-4 text-gray-400 text-xs italic bg-gray-50 rounded border border-dashed border-gray-200">
                                    暂无操作，请在上方添加
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Panel>
        </div>
    );
}
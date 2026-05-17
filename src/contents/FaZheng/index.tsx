import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Coins, LayoutGrid, RefreshCw, RotateCcw, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { useLevelToolbar } from '../../components/LevelContext';
import { type BadgeDef, COMBOS, GRADES, RELICS } from "./data";
import { getFaZhengRecommendation, type UIRecommendation } from "./evaluate.ts";


interface GameState {
    gold: number;
    buffer: string[]; // 存 Relic ID
    drawCount: number; // 当前回合已抽次数
    round: number;
    config: {
        xianYu: boolean; // 咸鱼回血
        firstDraw: boolean; // 首抽福利
        stars: '1' | '2+'; // 星级
    };
}

const getRelicImage = (id: string) => `/images/fa_zheng/${id}.webp`;

// --- Hook: 持久化状态 ---
function useUndoableState<T>(defaultValue: T, key: string, maxHistory = 30) {
    const [stateWrapper, setStateWrapper] = useState<{ current: T; past: T[] }>(() => {
        try {
            const item = window.localStorage.getItem(key);
            if (item) {
                const parsed = JSON.parse(item);
                // 数据迁移检查：如果是新结构则直接用，如果是旧结构(纯数据)则包裹起来
                if ('past' in parsed && Array.isArray(parsed.past)) {
                    return parsed;
                } else {
                    return { current: parsed, past: [] };
                }
            }
        } catch {
            // ignore error
        }
        return { current: defaultValue, past: [] };
    });

    useEffect(() => {
        window.localStorage.setItem(key, JSON.stringify(stateWrapper));
    }, [key, stateWrapper]);

    // 封装 setState，使其每次更新都自动入栈
    const setState = (updaterOrValue: T | ((prev: T) => T)) => {
        setStateWrapper(prev => {
            const newCurrent = typeof updaterOrValue === 'function'
                ? (updaterOrValue as (prev: T) => T)(prev.current)
                : updaterOrValue;

            // 如果新值和旧值一样（深比较太贵，这里简单判断引用或JSON），可以略过入栈，
            // 但为了简单和性能，我们直接入栈，依赖用户的操作频率。

            const newPast = [...prev.past, prev.current].slice(-maxHistory); // 限制历史长度
            return { current: newCurrent, past: newPast };
        });
    };

    const undo = () => {
        setStateWrapper(prev => {
            if (prev.past.length === 0) return prev;
            const previous = prev.past[prev.past.length - 1];
            const newPast = prev.past.slice(0, -1);
            return { current: previous, past: newPast };
        });
    };

    // 专门用于导入数据的重置函数（不留历史，或者把导入动作作为历史的一环）
    // 这里选择作为历史的一环，这样导入错了也能撤回

    return {
        state: stateWrapper.current,
        setState,
        undo,
        canUndo: stateWrapper.past.length > 0
    };
}

// --- 组件：详情 Modal ---
const DetailModal = ({ title, desc, badges, onClose }: {
    title: string,
    desc: string,
    badges: React.ReactNode,
    onClose: () => void
}) => (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}>
        <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full border border-slate-100 transform scale-100 transition-all"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-800">{title}</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
                {badges}
            </div>
            <p className="text-slate-600 leading-relaxed text-sm">{desc}</p>
            <div className="mt-6 text-center text-xs text-slate-400">点击任意处关闭</div>
        </div>
    </div>
);

const RelicAvatar = ({ id, name, className = "w-full h-full" }: {
    id: string,
    name: string,
    className?: string
}) => {
    return (
        <img
            src={getRelicImage(id)}
            alt={name}
            className={`${className} object-cover`}
            onError={(e) => {
                // 如果加载失败，隐藏图片，回退到显示首字母（需要父级有背景色支持）
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerText = name.substring(0, 1);
                // 或者在这里设置一个默认图片的 src
            }}
        />
    );
};

// --- 子组件：AI 建议卡片 (极简·实验版) ---
const RecommendationCard = ({ rec }: { rec: UIRecommendation }) => {
    // 仅通过文字颜色区分倾向，背景保持统一淡色，降低存在感
    const colorMap = {
        green: 'text-emerald-600',
        amber: 'text-amber-600',
        blue: 'text-slate-500',
        rose: 'text-rose-600'
    };

    const colorClass = colorMap[rec.style];
    const Icon = rec.Icon;

    return (
        <div
            className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2 flex items-start gap-2.5 transition-colors hover:bg-slate-50 hover:border-slate-400">
            {/* 图标 - 缩小尺寸 */}
            <div className={`mt-0.5 shrink-0 ${colorClass} opacity-90`}>
                <Icon size={14}/>
            </div>

            {/* 内容区 */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                    {/* 左侧：动作指令 */}
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${colorClass}`}>
                            {rec.action === 'NEXT' && "建议下回合"}
                            {rec.action === 'DRAW' && "建议抽取"}
                            {rec.action === 'SKILL' && "建议技能"}
                        </span>
                        {/* 策略标题 */}
                        <span className="text-[10px] text-slate-500 font-normal truncate max-w-[80px] sm:max-w-none">
                            - {rec.title}
                        </span>
                    </div>

                    {/* 右侧：免责声明 (极弱化) */}
                    <span
                        className="text-[9px] text-slate-400 border border-slate-200 px-1 rounded bg-white whitespace-nowrap">
                        [实验功能] 仅供参考
                    </span>
                </div>

                {/* 理由文字 - 灰色小字 */}
                <p className="text-[10px] text-slate-400 leading-tight pr-1">
                    {rec.reason}
                </p>
            </div>
        </div>
    );
};

// --- 主组件 ---
export default function FaZhengHelper() {
    // 默认状态
    const defaultState: GameState = {
        gold: 20,
        buffer: [],
        drawCount: 0,
        round: 1,
        config: {
            xianYu: false,
            firstDraw: false,
            stars: '1'
        }
    };

    const { state, setState, undo, canUndo } = useUndoableState<GameState>(defaultState, 'fazheng-v1');
    const [isGoldEditing, setIsGoldEditing] = useState(false);
    const [viewingItem, setViewingItem] = useState<{
        title: string;
        desc: string;
        badges: React.ReactNode
    } | null>(null);
    const [tempGold, setTempGold] = useState("");
    const [goldError, setGoldError] = useState(false);

    // [新增] 开始编辑金币
    const startEditGold = () => {
        setTempGold(state.gold.toString());
        setGoldError(false);
        setIsGoldEditing(true);
    };

    // [新增] 提交金币修改
    const commitGoldEdit = () => {
        if (goldError) return; // 有错误不提交
        const val = tempGold === '' ? 0 : parseInt(tempGold, 10);
        updateGold(val);
        setIsGoldEditing(false);
    };

    // [新增] 处理输入变化
    const handleGoldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            setTempGold('');
            setGoldError(false);
            return;
        }
        // 正则验证：只允许数字
        if (/^\d+$/.test(val)) {
            setTempGold(val);
            setGoldError(false);
        } else {
            setGoldError(true);
        }
    };

    // 计算当前抽卡消耗
    // 规则：抽第1次消耗3币(若首抽福利激活)，否则默认为2币？
    // 提示曰："抽取第1次消耗3币... 当激活首抽福利时，抽取金币的消耗起始为3币而不是2币"
    // 这句话有歧义，通常“福利”意味着便宜。这里按字面意思理解：
    // 若 firstDraw=true, base=3; 若 firstDraw=false, base=2。
    const currentDrawCost = useMemo(() => {
        const base = state.config.firstDraw ? 2 : 3;
        return base + state.drawCount;
    }, [state.config.firstDraw, state.drawCount]);

    // 动作：更新金币
    const updateGold = (val: number) => setState(prev => ({ ...prev, gold: val }));

    // 动作：抽卡
    const handleDraw = (relicId: string) => {
        if (state.gold < currentDrawCost) {
            alert("金币不足！");
            return;
        }

        setState(prev => {
            const newBuffer = [...prev.buffer];
            let refund = 0;

            // Buffer 逻辑：满3个则挤出第一个
            if (newBuffer.length >= 3) {
                const removedId = newBuffer.shift(); // 移除最早的
                // 咸鱼回血逻辑
                if (prev.config.xianYu && removedId) {
                    const removedRelic = RELICS.find(r => r.id === removedId);
                    if (removedRelic) {
                        refund = GRADES[removedRelic.grade].refund;
                    }
                }
            }
            newBuffer.push(relicId);

            return {
                ...prev,
                gold: prev.gold - currentDrawCost + refund,
                buffer: newBuffer,
                drawCount: prev.drawCount + 1
            };
        });
    };

    // 动作：下一回合
    const handleNextRound = () => {
        const income = state.config.stars === '2+' ? 9 : 5;
        setState(prev => ({
            ...prev,
            round: prev.round + 1,
            drawCount: 0,
            gold: prev.gold + income
        }));
    };

    // 动作：放技能 (仅做记录或无实际逻辑，按需求保留按钮)
    const handleSkill = () => {
        // 如果没有圣物，就不执行（可选优化）
        if (state.buffer.length === 0) return;

        // 核心逻辑：清空 buffer
        setState(prev => ({
            ...prev,
            buffer: []
        }));
    };

    // 动作：配置切换
    const toggleConfig = (key: 'xianYu' | 'firstDraw') => {
        setState(prev => ({
            ...prev,
            config: {
                ...prev.config,
                // 互斥逻辑：选了一个，另一个自动取消？还是可以共存？
                // 需求："它们两个最多只能选择一个"
                xianYu: key === 'xianYu' ? !prev.config.xianYu : false,
                firstDraw: key === 'firstDraw' ? !prev.config.firstDraw : false
            }
        }));
    };

    const handleReset = () => {
        if (!window.confirm("确定要重置所有状态吗？\n金币将重置为初始值，圣物将被清空。")) return;

        const income = state.config.stars === '2+' ? 9 : 5;
        setState(prev => ({
            ...prev,
            buffer: [],           // 清空 Buffer
            gold: 20 + income,    // 重置金币：初始20 + 第一回合收益
            drawCount: 0,         // 重置抽卡次数
            round: 1              // 重置回合数 (通常重置金币意味着新的一局)
        }));
    };

    // 导出/导入
    useLevelToolbar({
        onExport: () => ({
            // [修改] 导出时只导出当前状态，不要把历史栈也导出去(文件会太大)
            data: JSON.stringify(state),
            filename: `fazheng-round${state.round}.json`
        }),
        onImport: (json) => {
            try {
                const data = JSON.parse(json);
                if (data.gold !== undefined && data.buffer) {
                    setState(data); // 这会自动推入历史栈
                }
            } catch {
                alert("导入失败");
            }
        }
    });

    // 计算当前激活的组合技
    const activeCombos = useMemo(() => {
        return COMBOS.filter(combo => {
            // 检查 combo.relicIds 是否都在 state.buffer 中
            return combo.relicIds.every(reqId => state.buffer.includes(reqId));
        });
    }, [state.buffer]);

    const recommendation = useMemo(() => {
        return getFaZhengRecommendation({
            gold: state.gold,
            buffer: state.buffer,
            drawCount: state.drawCount,
            round: state.round,
            config: state.config
        });
    }, [state.gold, state.buffer, state.drawCount, state.round, state.config]);

    // [修改] 渲染 Badge：增加 isSmall 参数控制字体大小
    const renderBadges = (badges: BadgeDef[], isSmall = false) => (
        <>
            {badges.map((b, i) => (
                <span key={i}
                      className={`
                          font-bold rounded border whitespace-nowrap
                          ${isSmall ? 'text-[8px] px-1 py-[1px]' : 'text-[10px] px-1.5 py-0.5'} 
                          ${b.color ? `${GRADES[b.color].bg} ${GRADES[b.color].color} ${GRADES[b.color].border}` : 'bg-slate-100 text-slate-600 border-slate-200'}
                      `}>
                    {b.text}
                </span>
            ))}
        </>
    );

    return (
        <div className="max-w-3xl mx-auto p-2 sm:p-4 space-y-3 font-sans text-slate-800">
            {/* 1. 输入部分 - 顶部配置 (压缩 padding 和 margin) */}
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 space-y-2">
                <div className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-4">
                    {/* ... 命盘配置 ... */}
                    <div className="flex items-center justify-between sm:block sm:space-y-2">
                        <div
                            className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                            <Settings2 size={10} className="sm:w-3 sm:h-3"/> 命盘
                        </div>
                        <div className="flex gap-1 sm:gap-2">
                            {/* 按钮尺寸调小: py-1, text-[10px] */}
                            <button onClick={() => toggleConfig('xianYu')}
                                    className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold border transition-all ${state.config.xianYu ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>🐟
                                咸鱼
                            </button>
                            <button onClick={() => toggleConfig('firstDraw')}
                                    className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold border transition-all ${state.config.firstDraw ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>🎁
                                首抽
                            </button>
                        </div>
                    </div>

                    {/* ... 星级设置 ... */}
                    <div className="flex items-center justify-between sm:block sm:space-y-2">
                        <div
                            className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                            <Sparkles size={10} className="sm:w-3 sm:h-3"/> 星级
                        </div>
                        <div className="flex bg-slate-100 p-0.5 rounded-md">
                            {(['1', '2+'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setState(prev => ({
                                        ...prev,
                                        config: { ...prev.config, stars: s }
                                    }))}
                                    className={`px-3 py-1 rounded text-[10px] sm:text-xs font-bold transition-all ${state.config.stars === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                                >
                                    {s === '1' ? '一星' : '二星+'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 1.2 打关部分 (高度压缩) */}
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 space-y-3">
                {/* 状态栏：金币 & 消耗 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${goldError ? 'bg-red-50 border-red-300 text-red-600' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                            <Coins size={14}
                                   className={goldError ? 'text-red-500' : 'fill-yellow-500 text-yellow-600'}/>
                            {isGoldEditing ? (
                                <input
                                    type="text" // 改为 text 以完全控制输入
                                    autoFocus
                                    onBlur={commitGoldEdit}
                                    onKeyDown={(e) => e.key === 'Enter' && commitGoldEdit()}
                                    value={tempGold}
                                    onChange={handleGoldChange}
                                    className="w-10 bg-transparent border-b border-current text-center font-bold focus:outline-none text-sm"
                                    placeholder="0"
                                />
                            ) : (
                                <span className="text-lg font-black font-mono">{state.gold}</span>
                            )}
                        </div>
                        <button
                            onClick={startEditGold} // 使用新的 handler
                            className="text-[10px] text-slate-400 underline hover:text-indigo-600"
                        >
                            {isGoldEditing ? '完成' : '修改'}
                        </button>
                    </div>

                    <div className="text-right flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">消耗</span>
                        <span className="font-mono font-bold text-slate-700 text-sm">-{currentDrawCost} 💰</span>
                    </div>
                </div>

                {/* 2. [新增/修改] AI 建议模块插入位置 */}
                {/* 放在金币和抽卡区之间，作为决策辅助 */}
                <RecommendationCard rec={recommendation}/>

                {/* 1.2.2 圣物抽卡列表 (缩小尺寸) */}
                <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                        <LayoutGrid size={10}/> 抽取
                    </div>
                    {/* [修改] 间距缩小 gap-2, 按钮尺寸缩小 w-10 h-10 */}
                    <div className="flex flex-wrap gap-2 justify-start">
                        {RELICS.map(relic => (
                            <button
                                key={relic.id}
                                onClick={() => handleDraw(relic.id)}
                                className={`
                                    relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center shadow-sm transition-all active:scale-95
                                    ${GRADES[relic.grade].bg} ${GRADES[relic.grade].border}
                                `}
                            >
                                <RelicAvatar id={relic.id} name={relic.name}/>
                                <span
                                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                        relic.grade === 'RED' ? 'bg-rose-500' :
                                            relic.grade === 'GOLD' ? 'bg-amber-400' :
                                                relic.grade === 'PURPLE' ? 'bg-purple-500' : 'bg-blue-400'
                                    }`}></span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 1.2.3 控制 Toolbar (增加撤回按钮) */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                    {/* [新增] 重置按钮 (最左边，小尺寸 w-9) */}
                    <button
                        onClick={handleReset}
                        className="w-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all active:scale-95"
                        title="重置状态 (金币归位/清空圣物)"
                    >
                        <RefreshCw size={14}/>
                    </button>

                    <button
                        onClick={undo}
                        disabled={!canUndo}
                        className={`
                            w-12 flex items-center justify-center rounded-lg border transition-all active:scale-95
                            ${canUndo
                            ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
                            : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'}
                        `}
                        title="撤回上一步 (最多30步)"
                    >
                        <RotateCcw size={14}/>
                    </button>

                    <button
                        onClick={handleSkill}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 active:scale-95 transition-transform"
                    >
                        <Sparkles size={12}/> 技能
                    </button>

                    <button
                        onClick={handleNextRound}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-md shadow-indigo-200 active:scale-95 transition-transform"
                    >
                        下一回合 <ArrowRight size={12}/>
                    </button>
                </div>
            </div>

            {/* 2. 显示部分 - Buffer & Combos */}
            <div className="space-y-3">
                {/* 2.1 当前 Buffer */}
                <div className="relative">
                    <div className="flex justify-between items-end mb-1 px-1">
                        <h3 className="text-xs font-bold text-slate-700">持有 ({state.buffer.length}/3)</h3>
                        <p className="text-[10px] text-slate-400 mb-1 px-1">点击卡片可查看圣物详情</p>
                        <button onClick={() => setState(prev => ({ ...prev, buffer: [] }))}
                                className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1">
                            <Trash2 size={10}/> 清空
                        </button>
                    </div>
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -z-10 rounded-full"></div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-4 h-28 sm:h-40"> {/* 固定一个较矮的高度用于手机 */}
                        {[0, 1, 2].map(renderIndex => {
                            const bufferIndex = 2 - renderIndex;
                            const relicId = state.buffer[bufferIndex];
                            const relic = relicId ? RELICS.find(r => r.id === relicId) : null;
                            const isOldest = bufferIndex === 0 && relic;

                            return (
                                <div key={renderIndex}
                                     className="relative group h-full min-h-0"> {/* min-h-0 允许子元素滚动 */}
                                    {isOldest && state.buffer.length === 3 && (
                                        <div
                                            className="absolute -top-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded-full shadow-lg z-10 animate-bounce whitespace-nowrap">
                                            下个丢弃{state.config.xianYu ? `(+${GRADES[relic?.grade].refund}💰)` : ""}
                                        </div>
                                    )}

                                    {relic ? (
                                        <button
                                            onClick={() => setViewingItem({
                                                title: relic.name,
                                                desc: relic.desc,
                                                badges: renderBadges(relic.badges)
                                            })}
                                            className={`
                                                w-full h-full rounded-xl border flex flex-col items-center p-1.5 sm:p-2 gap-1 bg-white shadow-sm overflow-hidden
                                                ${GRADES[relic.grade].border}
                                            `}
                                        >
                                            {/* Avatar: 移动端缩小 */}
                                            <div className={`w-7 h-7 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center border overflow-hidden
                                                ${GRADES[relic.grade].border} bg-slate-100`}>
                                                <RelicAvatar id={relic.id} name={relic.name}/>
                                            </div>

                                            {/* Name: [核心修改] 移动端隐藏 (hidden)，sm以上显示 (sm:block) */}
                                            <div
                                                className="hidden sm:block font-bold text-xs text-slate-700 text-center truncate w-full shrink-0">
                                                {relic.name}
                                            </div>

                                            {/* Badges: [核心修改]
                                                1. overflow-y-auto: 允许内部滚动
                                                2. 隐藏滚动条样式 (scrollbar-hide 或 css)
                                                3. flex-wrap + justify-center
                                            */}
                                            <div
                                                className="flex flex-wrap gap-0.5 justify-center w-full overflow-y-auto no-scrollbar content-start">
                                                {/* 传入 true 启用小字体模式 */}
                                                {renderBadges(relic.badges, true)}
                                            </div>
                                        </button>
                                    ) : (
                                        <div
                                            className="w-full h-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center">
                                            <span className="text-slate-300 text-[10px]">空</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2.2 组合技列表 (紧凑版) */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div
                        className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">组合技</span>
                        <span
                            className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{activeCombos.length}</span>
                    </div>
                    {/* 限制最大高度，允许滚动，防止把上面顶出屏幕 */}
                    <div className="max-h-32 overflow-y-auto divide-y divide-slate-100">
                        {activeCombos.length > 0 ? (
                            activeCombos.map(combo => (
                                <button key={combo.id} onClick={() => setViewingItem({
                                    title: '组合技',
                                    desc: combo.desc,
                                    badges: renderBadges(combo.badges)
                                })}
                                        className="w-full flex items-center p-2 hover:bg-slate-50 transition-colors text-left"
                                >
                                    <div className="flex -space-x-1.5 mr-2 shrink-0">
                                        {combo.relicIds.map(rid => {
                                            const r = RELICS.find(i => i.id === rid);
                                            if (!r) return null;
                                            return (
                                                <div key={rid}
                                                     className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-white overflow-hidden ${GRADES[r.grade].border} bg-slate-100`}>
                                                    <RelicAvatar id={r.id} name={r.name}/>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap gap-0.5">
                                            {renderBadges(combo.badges, true)}
                                        </div>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="p-3 text-center text-[10px] text-slate-400">暂无</div>
                        )}
                    </div>
                </div>
            </div>
            {/* Modal 代码保持不变... */}
            {viewingItem && (
                <DetailModal
                    title={viewingItem.title}
                    desc={viewingItem.desc}
                    badges={viewingItem.badges}
                    onClose={() => setViewingItem(null)}
                />
            )}
        </div>
    );
}
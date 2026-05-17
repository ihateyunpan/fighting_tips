import { ArrowRightLeft, Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
    createDefaultActionItem,
    createDefaultOperationGroup,
    DEFAULT_SLOT_BORDER_CLASS,
    generateActionId,
    type ActionItem,
    type ActionSlot,
    type ActionType,
    type ConstraintType,
    type FixedOperator,
    type OperationRequirementData,
    type PreferenceRule,
    type PreferenceType
} from './operationRequirementTypes';
import { getActionLabel, getDisplayId } from './operationRequirementHelpers';

interface ActionRequirementGridProps {
    actions: ActionItem[];
    slots: ActionSlot[];
    /** 按 slot.index 配置框线颜色，未配置的使用灰色 */
    slotBorderClasses?: Partial<Record<number, string>>;
    onActionsChange: (actions: ActionItem[]) => void;
}

const ActionRequirementGrid = ({
    actions,
    slots,
    slotBorderClasses,
    onActionsChange
}: ActionRequirementGridProps) => {
    const borderForSlot = (index: number) =>
        slotBorderClasses?.[index] ?? DEFAULT_SLOT_BORDER_CLASS;
    const [editingId, setEditingId] = useState<string | null>(null);
    const [swapSourceId, setSwapSourceId] = useState<string | null>(null);

    const updateActionItem = (id: string, updates: Partial<ActionItem>) =>
        onActionsChange(actions.map(a => (a.id === id ? { ...a, ...updates } : a)));

    const addAction = (slotIndex: number) => {
        onActionsChange([...actions, createDefaultActionItem(slotIndex)]);
    };

    const removeAction = (id: string) => {
        onActionsChange(actions.filter(a => a.id !== id));
        if (editingId === id) setEditingId(null);
    };

    const toggleActionType = (id: string, type: ActionType) => {
        const action = actions.find(a => a.id === id);
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

    const handleSwapClick = (id: string) => {
        if (swapSourceId === null) setSwapSourceId(id);
        else if (swapSourceId === id) setSwapSourceId(null);
        else {
            const newActions = [...actions];
            const idx1 = newActions.findIndex(a => a.id === swapSourceId);
            const idx2 = newActions.findIndex(a => a.id === id);
            if (idx1 !== -1 && idx2 !== -1) {
                const temp = newActions[idx1];
                newActions[idx1] = newActions[idx2];
                newActions[idx2] = temp;
                const tempSlot = newActions[idx1].slotIndex;
                newActions[idx1].slotIndex = newActions[idx2].slotIndex;
                newActions[idx2].slotIndex = tempSlot;
                onActionsChange(newActions);
            }
            setSwapSourceId(null);
        }
    };

    return (
        <>
            <div className="mb-2 text-[10px] text-slate-400 flex flex-wrap gap-4 select-none">
                <span>① 点击卡片编辑操作</span>
                <span className="flex items-center gap-1">② 右下角 <ArrowRightLeft size={10}/> 交换顺序</span>
                <span>③ 虚线框和灰色序号表示软偏好(尽量满足)</span>
                <span>④ “{">"}” = 在某操作之前，“{"<"}” = 在某操作之后，“{"<<"}” = 紧跟某操作</span>
            </div>

            <div className="grid grid-cols-5 gap-2 mb-6">
                {slots.map((slot) => (
                    <div key={slot.index}
                         className={`flex flex-col gap-2 p-1.5 rounded-lg border border-dashed ${borderForSlot(slot.index)} bg-slate-50/50`}>
                        <div className="flex flex-col gap-1.5 min-h-[80px]">
                            {actions.filter(a => a.slotIndex === slot.index).map((action) => {
                                const displayId = getDisplayId(action.id, actions);
                                const isSwapping = swapSourceId === action.id;

                                const fixedItems: { val: number; op: FixedOperator; isSoft: boolean }[] = [];
                                if (action.constraint === 'FIXED') {
                                    fixedItems.push({
                                        val: action.fixedIndex || 1,
                                        op: action.fixedOperator || 'AT',
                                        isSoft: false
                                    });
                                }
                                (action.preferences || []).forEach(p => {
                                    if (p.type === 'FIXED') {
                                        fixedItems.push({
                                            val: p.fixedIndex || 1,
                                            op: p.fixedOperator || 'AT',
                                            isSoft: true
                                        });
                                    }
                                });
                                fixedItems.sort((a, b) => a.val - b.val);

                                const badges: { label: React.ReactNode; isSoft: boolean }[] = [];
                                if (action.constraint === 'RELATIVE') {
                                    action.relativeRules.forEach(r => {
                                        const rType = r.type === 'BEFORE' ? '>' : '<';
                                        const target = getDisplayId(r.targetId, actions);
                                        badges.push({ label: `${rType}${target}`, isSoft: false });
                                    });
                                }
                                (action.preferences || []).forEach(p => {
                                    if (p.type === 'EARLY') badges.push({ label: '靠前', isSoft: true });
                                    else if (p.type === 'LATE') badges.push({ label: '靠后', isSoft: true });
                                    else if (p.type === 'RELATIVE') {
                                        const rType = p.relativeType === 'BEFORE' ? '>' : '<';
                                        const target = getDisplayId(p.targetId || '', actions);
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

                                            {action.constraint === 'IMMEDIATE' ? (
                                                <div
                                                    className="flex items-center justify-center gap-1 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 mb-0.5">
                                                    <span
                                                        className="text-xs font-bold text-slate-700">{getActionLabel(action.types)}</span>
                                                    <span className="text-[10px] text-indigo-400">{'<<'}</span>
                                                    <span
                                                        className="text-[8px] font-mono bg-white border border-indigo-200 rounded px-1 text-indigo-600">{getDisplayId(action.immediateTargetId || '', actions)}</span>
                                                </div>
                                            ) : (
                                                <div
                                                    className="flex items-baseline justify-center gap-1 flex-wrap w-full">
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
                                                    <span
                                                        className="text-xs font-bold text-slate-700">{getActionLabel(action.types)}</span>
                                                </div>
                                            )}

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

            {editingId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-[1px]">
                    <div
                        className="bg-white rounded-xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}>
                        {(() => {
                            const action = actions.find(a => a.id === editingId);
                            if (!action) return null;
                            const displayId = getDisplayId(action.id, actions);
                            const safePreferences = action.preferences || [];

                            const updatePref = (prefId: string, diff: Partial<PreferenceRule>) => {
                                updateActionItem(action.id, {
                                    preferences: safePreferences.map(p => p.id === prefId ? { ...p, ...diff } : p)
                                });
                            };
                            const addPref = (type: PreferenceType) => {
                                updateActionItem(action.id, {
                                    preferences: [...safePreferences, {
                                        id: generateActionId(),
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
                                                            const groupOps = actions.filter(a => a.slotIndex === s.index && a.id !== action.id);
                                                            if (groupOps.length === 0) return null;
                                                            return <optgroup key={s.index}
                                                                             label={`${s.index + 1}号位 (${s.element})`}>{groupOps.map(op =>
                                                                <option key={op.id}
                                                                        value={op.id}>{s.index + 1}号位-{getActionLabel(op.types)} ({getDisplayId(op.id, actions)})</option>)}</optgroup>
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
                                                                onClick={() => onActionsChange(actions.map(a => a.id === action.id ? {
                                                                    ...a,
                                                                    relativeRules: a.relativeRules.filter(r => r.id !== rule.id)
                                                                } : a))} className="text-slate-300 hover:text-red-500">
                                                                <X size={14}/></button>
                                                            <select value={rule.targetId}
                                                                    onChange={(e) => onActionsChange(actions.map(a => a.id === action.id ? {
                                                                        ...a,
                                                                        relativeRules: a.relativeRules.map(r => r.id === rule.id ? {
                                                                            ...r,
                                                                            targetId: e.target.value
                                                                        } : r)
                                                                    } : a))}
                                                                    className="flex-1 text-xs border-slate-200 rounded py-1 pl-1 bg-transparent">
                                                                <option value="">选择操作...</option>
                                                                {slots.map(s => {
                                                                    const groupOps = actions.filter(a => a.slotIndex === s.index && a.id !== action.id && a.slotIndex !== action.slotIndex);
                                                                    if (groupOps.length === 0) return null;
                                                                    return <optgroup key={s.index}
                                                                                     label={`${s.index + 1}号位 (${s.element})`}>{groupOps.map(op =>
                                                                        <option key={op.id}
                                                                                value={op.id}>{s.index + 1}号位-{getActionLabel(op.types)} ({getDisplayId(op.id, actions)})</option>)}</optgroup>
                                                                })}
                                                            </select>
                                                            <button
                                                                onClick={() => onActionsChange(actions.map(a => a.id === action.id ? {
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
                                                        onClick={() => onActionsChange(actions.map(a => a.id === action.id ? {
                                                            ...a,
                                                            relativeRules: [...a.relativeRules, {
                                                                id: generateActionId(),
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

                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label
                                                    className="text-xs font-bold text-gray-500 flex items-center gap-2">
                                                    <div
                                                        className="w-2 h-2 rounded-full border border-gray-400 border-dashed"></div>
                                                    软性偏好 (尽量满足)
                                                </label>

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
                                                        <div
                                                            className="shrink-0 px-1.5 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-500 rounded border border-slate-200">
                                                            {pref.type === 'EARLY' && '靠前'}
                                                            {pref.type === 'LATE' && '靠后'}
                                                            {pref.type === 'FIXED' && '固定'}
                                                            {pref.type === 'RELATIVE' && '相对'}
                                                        </div>

                                                        <div className="flex-1 space-y-2">
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

                                                            {pref.type === 'RELATIVE' && (
                                                                <div className="flex items-center gap-2">
                                                                    <select value={pref.targetId}
                                                                            onChange={(e) => updatePref(pref.id, { targetId: e.target.value })}
                                                                            className="flex-1 text-xs border border-slate-200 rounded py-1 pl-1 bg-white">
                                                                        <option value="">选择操作...</option>
                                                                        {slots.map(s => {
                                                                            const groupOps = actions.filter(a => a.slotIndex === s.index && a.id !== action.id);
                                                                            if (groupOps.length === 0) return null;
                                                                            return <optgroup key={s.index}
                                                                                             label={`${s.index + 1}号位 (${s.element})`}>{groupOps.map(op =>
                                                                                <option key={op.id}
                                                                                        value={op.id}>{s.index + 1}号位-{getActionLabel(op.types)} ({getDisplayId(op.id, actions)})</option>)}</optgroup>
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
        </>
    );
};

const getGroupDisplayName = (group: { name?: string }, index: number) => {
    const trimmed = group.name?.trim();
    return trimmed ? trimmed : `操作组${index + 1}`;
};

const PANEL_LABEL_CLASS = 'text-xs font-bold text-slate-500 w-36 shrink-0 whitespace-nowrap';

export interface OperationRequirementPanelProps {
    value: OperationRequirementData;
    onChange: (value: OperationRequirementData) => void;
    slots: ActionSlot[];
    /** 按 slot.index 配置框线颜色；相同 index 在各操作组中颜色一致，未配置为灰色 */
    slotBorderClasses?: Partial<Record<number, string>>;
}

export const OperationRequirementPanel = ({
    value,
    onChange,
    slots,
    slotBorderClasses
}: OperationRequirementPanelProps) => {
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [isEditingGroups, setIsEditingGroups] = useState(false);
    const [editingGroupNameId, setEditingGroupNameId] = useState<string | null>(null);
    const [nameDraft, setNameDraft] = useState('');
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [draggingGroupIndex, setDraggingGroupIndex] = useState<number | null>(null);
    const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);
    const skipBlurCommitRef = useRef(false);

    const { groups } = value;

    const activeGroupId =
        groups.length === 0
            ? null
            : selectedGroupId && groups.some(g => g.id === selectedGroupId)
              ? selectedGroupId
              : groups[0].id;

    const addGroup = () => {
        const newGroup = createDefaultOperationGroup(groups.length);
        onChange({ groups: [...groups, newGroup] });
        setSelectedGroupId(newGroup.id);
    };

    const updateGroupName = (groupId: string, name: string) => {
        onChange({
            groups: groups.map(g =>
                g.id === groupId ? { ...g, name: name.trim() || getGroupDisplayName(g, groups.indexOf(g)) } : g
            )
        });
    };

    const commitGroupName = (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        const index = groups.indexOf(group);
        const trimmed = nameDraft.trim();
        updateGroupName(groupId, trimmed || getGroupDisplayName(group, index));
        setEditingGroupNameId(prev => (prev === groupId ? null : prev));
    };

    const commitGroupNameOnBlur = (groupId: string) => {
        if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
        }
        window.setTimeout(() => {
            if (editingGroupNameId !== groupId) return;
            if (nameInputRef.current && document.activeElement === nameInputRef.current) return;
            commitGroupName(groupId);
        }, 0);
    };

    const startGroupNameEdit = (group: (typeof groups)[number], index: number) => {
        if (editingGroupNameId === group.id) return;
        if (editingGroupNameId) commitGroupName(editingGroupNameId);
        setEditingGroupNameId(group.id);
        setNameDraft(getGroupDisplayName(group, index));
        setSelectedGroupId(group.id);
    };

    useEffect(() => {
        if (editingGroupNameId) nameInputRef.current?.focus();
    }, [editingGroupNameId]);

    const removeGroup = (groupId: string) => {
        const nextGroups = groups.filter(g => g.id !== groupId);
        onChange({ groups: nextGroups });
        if (activeGroupId === groupId) {
            setSelectedGroupId(nextGroups[0]?.id ?? null);
        }
    };

    const updateGroupActions = (groupId: string, actions: ActionItem[]) => {
        onChange({
            groups: groups.map(g => (g.id === groupId ? { ...g, actions } : g))
        });
    };

    const reorderGroups = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
        const next = [...groups];
        const [removed] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, removed);
        onChange({ groups: next });
    };

    const selectedGroup = groups.find(g => g.id === activeGroupId);

    return (
        <div className="mb-6">
            <div className="mb-2 text-[10px] text-slate-400 flex flex-wrap gap-4 select-none">
                <span>① 点击“+”添加操作组；② 满足任意操作组就被视为可行</span>
                <span>③ 排在前面的操作组优先级更高</span>
                <span>④ 编辑模式下，点击操作组改名、拖拽可调整顺序</span>
            </div>

            <div className="flex items-center gap-3 mb-3">
                <span className={PANEL_LABEL_CLASS}>操作要求</span>
                <div className="flex flex-wrap items-center gap-2 flex-1">
                    {groups.map((group, index) => {
                        const isSelected = group.id === activeGroupId;
                        const isDragOver = isEditingGroups && dragOverGroupIndex === index && draggingGroupIndex !== index;
                        return (
                            <div
                                key={group.id}
                                role="button"
                                tabIndex={0}
                                draggable={isEditingGroups && editingGroupNameId !== group.id}
                                onDragStart={e => {
                                    if (!isEditingGroups || editingGroupNameId === group.id) return;
                                    setDraggingGroupIndex(index);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', String(index));
                                }}
                                onDragEnd={() => {
                                    setDraggingGroupIndex(null);
                                    setDragOverGroupIndex(null);
                                }}
                                onDragEnter={() => {
                                    if (!isEditingGroups || draggingGroupIndex === null) return;
                                    setDragOverGroupIndex(index);
                                }}
                                onDragOver={e => {
                                    if (!isEditingGroups || draggingGroupIndex === null) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                }}
                                onDragLeave={e => {
                                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                    setDragOverGroupIndex(prev => (prev === index ? null : prev));
                                }}
                                onDrop={e => {
                                    e.preventDefault();
                                    if (!isEditingGroups) return;
                                    const from = draggingGroupIndex ?? Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
                                    if (Number.isFinite(from) && from !== index) {
                                        reorderGroups(from, index);
                                    }
                                    setDraggingGroupIndex(null);
                                    setDragOverGroupIndex(null);
                                }}
                                onClick={() => {
                                    if (editingGroupNameId === group.id) return;
                                    if (isEditingGroups) {
                                        startGroupNameEdit(group, index);
                                    } else {
                                        setSelectedGroupId(group.id);
                                    }
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        if (editingGroupNameId === group.id) return;
                                        if (isEditingGroups) startGroupNameEdit(group, index);
                                        else setSelectedGroupId(group.id);
                                    }
                                }}
                                title={isEditingGroups ? '拖拽调整顺序' : undefined}
                                className={`relative flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded border transition-colors ${
                                    isSelected
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                } ${
                                    isEditingGroups ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                } ${
                                    isDragOver ? 'ring-2 ring-indigo-400 ring-offset-1 border-indigo-400' : ''
                                } ${
                                    isEditingGroups && draggingGroupIndex === index ? 'opacity-60' : ''
                                }`}
                            >
                                {isEditingGroups && (
                                    <GripVertical
                                        size={14}
                                        className={`shrink-0 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}
                                        aria-hidden
                                    />
                                )}
                                {isEditingGroups && editingGroupNameId === group.id ? (
                                    <input
                                        ref={nameInputRef}
                                        value={nameDraft}
                                        onChange={e => setNameDraft(e.target.value)}
                                        onBlur={() => commitGroupNameOnBlur(group.id)}
                                        onKeyDown={e => {
                                            e.stopPropagation();
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                skipBlurCommitRef.current = true;
                                                commitGroupName(group.id);
                                            } else if (e.key === 'Escape') {
                                                e.preventDefault();
                                                skipBlurCommitRef.current = true;
                                                setEditingGroupNameId(null);
                                            }
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={e => e.stopPropagation()}
                                        draggable={false}
                                        className={`w-20 min-w-0 bg-transparent border-b outline-none text-xs font-bold ${
                                            isSelected
                                                ? 'border-indigo-200 text-white placeholder:text-indigo-200'
                                                : 'border-indigo-300 text-slate-700'
                                        }`}
                                    />
                                ) : (
                                    getGroupDisplayName(group, index)
                                )}
                                {isEditingGroups && (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        draggable={false}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeGroup(group.id);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                removeGroup(group.id);
                                            }
                                        }}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                                    >
                                        <X size={10} strokeWidth={3}/>
                                    </span>
                                )}
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        onClick={addGroup}
                        className="w-8 h-8 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                        title="添加操作组"
                    >
                        <Plus size={14} strokeWidth={3}/>
                    </button>
                    {groups.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                if (isEditingGroups && editingGroupNameId) {
                                    commitGroupName(editingGroupNameId);
                                }
                                setIsEditingGroups(!isEditingGroups);
                            }}
                            className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
                                isEditingGroups
                                    ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                                    : 'text-slate-400 border-slate-200 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50'
                            }`}
                            title={isEditingGroups ? '完成编辑' : '编辑操作组'}
                        >
                            {isEditingGroups ? <Check size={14} strokeWidth={3}/> : <Pencil size={14} strokeWidth={3}/>}
                        </button>
                    )}
                </div>
            </div>

            {selectedGroup && (
                <ActionRequirementGrid
                    actions={selectedGroup.actions}
                    slots={slots}
                    slotBorderClasses={slotBorderClasses}
                    onActionsChange={(actions) => updateGroupActions(selectedGroup.id, actions)}
                />
            )}
        </div>
    );
};

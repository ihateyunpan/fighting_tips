import { useState } from 'react';
import {
    appendRound,
    createInitialRound,
    formatEnergy,
    type RoundState,
    withKilledAt,
} from './logic';

function UsagePanel() {
    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-800">使用说明</h2>
            </div>
            <div className="px-4 py-3 space-y-4 text-sm text-slate-700 leading-relaxed">
                <section className="space-y-1.5">
                    <h3 className="font-bold text-slate-900">
                        机制一：选择
                        <span className="text-red-600">第3个行动</span>
                        的密探
                    </h3>
                    <p className="text-slate-600">每回合按以下步骤操作：</p>
                    <ol className="list-decimal list-inside space-y-1.5 pl-0.5">
                        <li>
                            先预判本回合是否会
                            <span className="font-semibold text-slate-900">击杀 boss 一条命</span>
                            。是 —
                            <span className="font-semibold text-emerald-700">勾选</span>
                            ，否 —
                            <span className="font-semibold text-slate-500">不勾选</span>
                        </li>
                        <li>
                            选择本行里「
                            <span className="font-semibold text-red-600">红圈密探</span>
                            」
                            <span className="font-bold text-slate-900">其中之一</span>
                            ，作为
                            <span className="font-bold text-red-600">第3个行动</span>
                            的密探
                        </li>
                        <li>
                            观察本回合是否真的打死了 boss。是 —
                            <span className="font-semibold text-emerald-700">勾选</span>
                            ，否 —
                            <span className="font-semibold text-slate-500">不勾选</span>
                        </li>
                        <li>
                            点击「
                            <span className="font-semibold text-indigo-700">增加</span>
                            」，进入
                            <span className="font-semibold text-slate-900">下回合</span>
                        </li>
                    </ol>
                </section>

                <section className="space-y-1.5">
                    <h3 className="font-bold text-slate-900">
                        机制二：
                        <span className="text-indigo-700">第一个行动</span>
                        的密探，操作
                        <span className="font-bold text-amber-700">不能和 boss 本回合操作相同</span>
                    </h3>
                    <p className="text-slate-600 pl-0.5">
                        <span className="font-semibold text-slate-800">【例】</span>
                        boss 这回合
                        <span className="font-semibold text-slate-900">普攻</span>
                        ，第一个行动的就不能普攻；boss 这回合又
                        <span className="font-semibold text-slate-900">普攻</span>
                        又
                        <span className="font-semibold text-slate-900">技能</span>
                        ，第一个行动的就只能
                        <span className="font-bold text-indigo-700">下拉</span>
                    </p>
                </section>

                <section className="space-y-1.5">
                    <h3 className="font-bold text-slate-900">
                        机制三：boss 受到的
                        <span className="font-bold text-red-600">第一种伤害永远为 0</span>
                    </h3>
                    <p className="text-slate-600 pl-0.5">
                        <span className="font-semibold text-slate-800">【例】</span>
                        boss 受的第一次伤害是
                        <span className="font-semibold text-slate-900">普攻伤害</span>
                        ，那本回合
                        <span className="font-bold text-red-600">所有普攻伤害都是 0</span>
                        （可用
                        <span className="font-semibold text-amber-700">戏学逃课</span>
                        ）
                    </p>
                </section>
            </div>
        </div>
    );
}

export default function Yuan2026L5() {
    const [rounds, setRounds] = useState<RoundState[]>(() => [createInitialRound()]);

    const lastIndex = rounds.length - 1;

    const handleAdd = () => {
        setRounds((prev) => [...prev, appendRound(prev)]);
    };

    const handleDelete = (index: number) => {
        if (rounds.length <= 1) return;
        setRounds((prev) => {
            const kept = prev.slice(0, index);
            return kept.length === 0 ? [createInitialRound()] : kept;
        });
    };

    const handleKillChange = (index: number, killed: boolean) => {
        if (index !== lastIndex) return;
        setRounds((prev) => withKilledAt(prev, index, killed));
    };

    return (
        <div className="space-y-4">
            <UsagePanel />

            <div className="space-y-2">
                <p className="text-sm text-slate-600">
                    红圈为
                    <span className="mx-0.5 font-bold text-red-600">第3个</span>
                    行动的密探
                </p>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-700">
                                <th className="px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                    回合
                                </th>
                                <th className="px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                    能量
                                </th>
                                <th className="px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                    是否击杀
                                </th>
                                <th className="px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                    红圈密探
                                </th>
                                <th className="px-3 py-2 text-left font-semibold border-b border-slate-200" />
                            </tr>
                        </thead>
                        <tbody>
                            {rounds.map((row, index) => {
                                const isLast = index === lastIndex;
                                const canDelete = rounds.length > 1;

                                return (
                                    <tr
                                        key={row.round}
                                        className="border-b border-slate-100 last:border-0 bg-white"
                                    >
                                        <td className="px-3 py-2 font-mono text-slate-800">
                                            {row.round}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-800">
                                            {formatEnergy(row.energy, row.energyMax)}
                                        </td>
                                        <td className="px-3 py-2">
                                            {isLast ? (
                                                <input
                                                    type="checkbox"
                                                    checked={row.killed}
                                                    onChange={(e) =>
                                                        handleKillChange(index, e.target.checked)
                                                    }
                                                    className="h-4 w-4 accent-slate-700 cursor-pointer"
                                                    aria-label={`第 ${row.round} 回合是否击杀`}
                                                />
                                            ) : (
                                                <span
                                                    className={
                                                        row.killed
                                                            ? 'font-bold text-emerald-600'
                                                            : 'font-bold text-slate-400'
                                                    }
                                                >
                                                    {row.killed ? '✓' : '×'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                                            {row.redRing}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleAdd}
                                                    disabled={!isLast}
                                                    className="px-2 py-1 rounded border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                                >
                                                    增加
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(index)}
                                                    disabled={!canDelete}
                                                    className="px-2 py-1 rounded border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                                >
                                                    删除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

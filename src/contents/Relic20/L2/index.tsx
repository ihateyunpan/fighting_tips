import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import {
    BOOK_MAX,
    cycleCount,
    findPlan,
    inferRound,
    SWORD_MAX,
    TARGET_ROUNDS,
    type Energy,
    type TargetRound,
} from './logic';

const ENERGY_OPTIONS = [0, 1, 2, 3];
const SWORD_OPTIONS = Array.from({ length: SWORD_MAX + 1 }, (_, i) => i);
const BOOK_OPTIONS = Array.from({ length: BOOK_MAX + 1 }, (_, i) => i);
const KILL_COUNT_OPTIONS = [0, 1, 2, 3, 4];
/** ①③ 火，②④ 水 */
const MOBS = [
    { mark: '①', element: '火', tone: 'text-orange-600', badge: 'bg-orange-600' },
    { mark: '②', element: '水', tone: 'text-sky-600', badge: 'bg-sky-600' },
    { mark: '③', element: '火', tone: 'text-orange-600', badge: 'bg-orange-600' },
    { mark: '④', element: '水', tone: 'text-sky-600', badge: 'bg-sky-600' },
] as const;
const MOB_MARK = MOBS.map((m) => m.mark);
const FULL_ENERGY_OPTIONS = ['不满', '满'] as const;

function allCountsAllowed(): boolean[][] {
    return Array.from({ length: 4 }, () => KILL_COUNT_OPTIONS.map(() => true));
}

function Segmented<T extends string | number>({
                       options,
                       isOn,
                       onPick,
                       mode,
                       label,
                       isDisabled,
                       format = (value) => String(value),
                   }: {
    options: readonly T[];
    isOn: (value: T) => boolean;
    onPick: (value: T) => void;
    mode: 'single' | 'multi';
    label: string;
    isDisabled?: (value: T) => boolean;
    format?: (value: T) => string;
}) {
    return (
        <div
            className="inline-flex overflow-hidden rounded border border-slate-200"
            role={mode === 'single' ? 'radiogroup' : 'group'}
            aria-label={label}
        >
            {options.map((value) => {
                const on = isOn(value);
                const disabled = isDisabled?.(value) ?? false;
                return (
                    <button
                        key={value}
                        type="button"
                        role={mode === 'single' ? 'radio' : 'checkbox'}
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => onPick(value)}
                        className={`min-w-6 border-l border-slate-200 px-1.5 py-0.5 text-xs font-medium leading-5 first:border-l-0 ${
                            disabled
                                ? 'cursor-not-allowed bg-slate-50 text-slate-300'
                                : on
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {format(value)}
                    </button>
                );
            })}
        </div>
    );
}

function RoundMark({ children }: { children: number }) {
    return <span className="font-bold text-indigo-700 tabular-nums">{children}</span>;
}

function SectionTitle({ children }: { children: string }) {
    return <h2 className="text-base font-bold text-slate-900">{children}</h2>;
}

function MechanismPanel() {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
            <p className="font-bold text-slate-900">机制要求</p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-5">
                <li>
                    <span className="font-semibold text-sky-700">水小怪</span>
                    （②④）行动后，孙静
                    <span className="font-semibold text-violet-700">书 +1</span>
                    ；
                    <span className="font-semibold text-orange-700">火小怪</span>
                    （①③）行动后，如果
                    <span className="font-semibold text-violet-700">书 ≥ 2</span>
                    ，
                    <span className="font-semibold text-violet-700">书清零</span>
                    ，
                    <span className="font-semibold text-amber-700">剑 +1</span>
                    ；孙静行动时，如果
                    <span className="font-semibold text-slate-900">不满能量</span>
                    且
                    <span className="font-semibold text-amber-700">剑 &gt; 0</span>
                    ，
                    <span className="font-semibold text-violet-700">书 +1</span>
                    。
                </li>
                <li>
                    回合
                    <RoundMark>{4}</RoundMark>、<RoundMark>{8}</RoundMark>、<RoundMark>{12}</RoundMark>、
                    <RoundMark>{16}</RoundMark>
                    时，孙静行动时，
                    <span className="font-semibold text-amber-700">剑数量 × 书数量 = 回合数</span>
                    。
                </li>
                <li>
                    击杀孙静时，孙静必须
                    <span className="font-semibold text-rose-600">剑 ≥ 2</span>
                    。
                </li>
            </ol>
        </div>
    );
}

function UsagePanel() {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
            <ol className="list-decimal space-y-1 pl-5 text-slate-600">
                <li>
                    指定你要模拟的
                    <span className="font-semibold text-slate-900">回合范围</span>
                </li>
                <li>
                    指定最开始时的
                    <span className="font-semibold text-slate-900">小怪能量</span>
                </li>
                <li>
                    规定模拟回合内每个回合允许击杀的
                    <span className="font-semibold text-slate-900">小怪数量</span>
                </li>
                <li>
                    根据
                    <span className="font-semibold text-indigo-700">计算结果</span>
                    击杀
                </li>
            </ol>
            <p className="mt-2 rounded-md border border-amber-100 bg-amber-50/80 px-2.5 py-2 text-[13px] leading-relaxed text-slate-600">
                <span className="font-bold text-amber-800">注意：</span>
                如果有两个四回合循环击杀要求不一样，就
                <span className="font-semibold text-slate-900">分 2 次模拟</span>
                。例如：回合
                <RoundMark>{1}</RoundMark>–<RoundMark>{8}</RoundMark>
                要求孙静满能量回合击杀
                <span className="font-bold text-rose-600">4</span>
                小怪，回合
                <RoundMark>{9}</RoundMark>–<RoundMark>{16}</RoundMark>
                只要求击杀
                <span className="font-bold text-rose-600">1</span>
                个，就先计算目标回合
                <RoundMark>{4}</RoundMark>–<RoundMark>{8}</RoundMark>
                ，再计算目标回合
                <RoundMark>{12}</RoundMark>–<RoundMark>{16}</RoundMark>
                。
            </p>
        </div>
    );
}

function formatEnergy(energy: readonly number[]): string {
    return energy.map((value, index) => `${MOB_MARK[index]}${value}`).join(' ');
}

function patchEnergy(prev: Energy, index: number, value: number): Energy {
    const next: Energy = [prev[0], prev[1], prev[2], prev[3]];
    next[index] = value;
    return next;
}

function SingleRound() {
    const [open, setOpen] = useState(false);
    const [energy, setEnergy] = useState<Energy>([1, 1, 1, 1]);
    const [sword, setSword] = useState(0);
    const [book, setBook] = useState(0);
    const [fullEnergy, setFullEnergy] = useState(false);

    const rows = useMemo(
        () => (open ? inferRound({ energy, sword, book, fullEnergy }) : []),
        [open, energy, sword, book, fullEnergy],
    );

    return (
        <section className="space-y-3">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="flex items-center gap-1 text-left"
                aria-expanded={open}
            >
                {open ? (
                    <ChevronDown size={18} className="shrink-0 text-slate-400" />
                ) : (
                    <ChevronRight size={18} className="shrink-0 text-slate-400" />
                )}
                <SectionTitle>单回合推断器</SectionTitle>
                <span className="ml-1 text-xs font-normal text-slate-400">
                    {open ? '收起' : '展开'}
                </span>
            </button>
            {open && (
            <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-xs font-semibold text-slate-500">本回合开始时的小怪能量</span>
                {energy.map((value, index) => (
                    <label key={index} className="inline-flex items-center gap-1.5">
                        <span className="inline-flex min-w-7 flex-col items-center leading-none">
                            <span className="text-xs text-slate-500">{MOBS[index].mark}</span>
                            <span className={`text-[10px] font-semibold ${MOBS[index].tone}`}>
                                {MOBS[index].element}
                            </span>
                        </span>
                        <Segmented
                            options={ENERGY_OPTIONS}
                            mode="single"
                            label={`小怪${MOBS[index].mark}能量`}
                            isOn={(n) => n === value}
                            onPick={(n) => setEnergy((prev) => patchEnergy(prev, index, n))}
                        />
                    </label>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">剑</span>
                    <Segmented
                        options={SWORD_OPTIONS}
                        mode="single"
                        label="剑个数"
                        isOn={(n) => n === sword}
                        onPick={setSword}
                    />
                </label>
                <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">书</span>
                    <Segmented
                        options={BOOK_OPTIONS}
                        mode="single"
                        label="书个数"
                        isOn={(n) => n === book}
                        onPick={setBook}
                    />
                </label>
                <label className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500">孙静能量</span>
                    <Segmented
                        options={FULL_ENERGY_OPTIONS}
                        mode="single"
                        label="孙静是否满能量"
                        isOn={(n) => (n === '满') === fullEnergy}
                        onPick={(n) => setFullEnergy(n === '满')}
                    />
                </label>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                            <th className="px-3 py-1.5 font-medium">击杀</th>
                            <th className="px-3 py-1.5 font-medium">剑</th>
                            <th className="px-3 py-1.5 font-medium">书</th>
                            <th className="px-3 py-1.5 font-medium">下回合开始能量</th>
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((row) => (
                            <tr key={row.killed.join(',') || 'none'} className="border-b border-slate-100 last:border-0">
                                <td className="px-3 py-2 align-middle">
                                    {row.killed.length === 0 ? (
                                        <span className="text-sm text-slate-300">无</span>
                                    ) : (
                                        <span className="inline-flex gap-1">
                                            {row.killed.map((mob) => (
                                                <span
                                                    key={mob}
                                                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md text-lg font-bold leading-none text-white ${MOBS[mob - 1].badge}`}
                                                >
                                                    {MOB_MARK[mob - 1]}
                                                </span>
                                            ))}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2 font-mono align-middle">{row.sword}</td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap align-middle">
                                    {row.book}
                                    {row.bookFromSword && (
                                        <span className="ml-1 text-[10px] font-sans text-slate-400">剑&gt;0</span>
                                    )}
                                </td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap align-middle">
                                    {formatEnergy(row.nextEnergy)}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}
        </section>
    );
}

/** 第 roundIndex（0–3）行对应的实际回合号，跨多个周期时用 / 连接。 */
function cycleRoundLabel(targetStart: TargetRound, targetEnd: TargetRound, roundIndex: number): string {
    const cycles = cycleCount(targetStart, targetEnd);
    const first = targetStart - 3 + roundIndex;
    const parts: number[] = [];
    for (let cycle = 0; cycle < cycles; cycle++) {
        parts.push(first + cycle * 4);
    }
    return parts.join('/');
}

export default function SunJing() {
    const [energy, setEnergy] = useState<Energy>([1, 1, 1, 1]);
    const [targetStart, setTargetStart] = useState<TargetRound>(4);
    const [targetEnd, setTargetEnd] = useState<TargetRound>(16);
    const [allowed, setAllowed] = useState<boolean[][]>(allCountsAllowed);

    const cycles = cycleCount(targetStart, targetEnd);
    const startIndex = TARGET_ROUNDS.indexOf(targetStart);
    const simStartRound = targetStart - 3;

    const plan = useMemo(
        () => findPlan({ energy, targetStart, targetEnd, allowedCounts: allowed }),
        [energy, targetStart, targetEnd, allowed],
    );

    const emptyRound = allowed.findIndex((row) => !row.some(Boolean));

    const setMobEnergy = (index: number, value: number) => {
        setEnergy((prev) => patchEnergy(prev, index, value));
    };

    const toggleCount = (roundIndex: number, count: number) => {
        setAllowed((prev) =>
            prev.map((row, index) => {
                if (index !== roundIndex) return row;
                const next = [...row];
                next[count] = !next[count];
                return next;
            }),
        );
    };

    return (
        <div className="space-y-4 text-sm text-slate-800">
            <MechanismPanel />
            <SingleRound />
            <section className="space-y-3">
            <SectionTitle>多回合推断器</SectionTitle>
            <UsagePanel />

            <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-xs font-semibold text-slate-500">目标回合</span>
                    <label className="inline-flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">起始</span>
                        <Segmented
                            options={TARGET_ROUNDS}
                            mode="single"
                            label="起始目标回合"
                            isOn={(n) => n === targetStart}
                            isDisabled={(n) => n > targetEnd}
                            onPick={(n) => setTargetStart(n as TargetRound)}
                        />
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">终止</span>
                        <Segmented
                            options={TARGET_ROUNDS}
                            mode="single"
                            label="终止目标回合"
                            isOn={(n) => n === targetEnd}
                            isDisabled={(n) => n < targetStart}
                            onPick={(n) => setTargetEnd(n as TargetRound)}
                        />
                    </label>
                </div>
                <p className="text-center text-sm text-slate-600">
                    将模拟回合
                    <RoundMark>{simStartRound}</RoundMark>
                    到回合
                    <RoundMark>{targetEnd}</RoundMark>
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-xs font-semibold text-slate-500">
                    回合
                    <span className="font-bold text-slate-800">{simStartRound}</span>
                    开始时的小怪能量
                </span>
                {energy.map((value, index) => (
                    <label key={index} className="inline-flex items-center gap-1.5">
                        <span className="inline-flex min-w-7 flex-col items-center leading-none">
                            <span className="text-xs text-slate-500">{MOBS[index].mark}</span>
                            <span className={`text-[10px] font-semibold ${MOBS[index].tone}`}>
                                {MOBS[index].element}
                            </span>
                        </span>
                        <Segmented
                            options={ENERGY_OPTIONS}
                            mode="single"
                            label={`小怪${MOBS[index].mark}能量`}
                            isOn={(n) => n === value}
                            onPick={(n) => setMobEnergy(index, n)}
                        />
                    </label>
                ))}
            </div>

            <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-500">每回合能打死的小怪数量</div>
                {allowed.map((row, roundIndex) => {
                    const label = cycleRoundLabel(targetStart, targetEnd, roundIndex);
                    return (
                        <div key={roundIndex} className="flex items-center gap-2">
                            <span className="min-w-10 shrink-0 font-mono text-xs text-slate-500">
                                回合{label}
                            </span>
                            <Segmented
                                options={KILL_COUNT_OPTIONS}
                                mode="multi"
                                label={`回合${label}可击杀数量`}
                                isOn={(n) => row[n]}
                                onPick={(n) => toggleCount(roundIndex, n)}
                            />
                        </div>
                    );
                })}
                {cycles > 1 && (
                    <p className="text-[11px] leading-relaxed text-slate-400">
                        共 {cycles} 个四回合周期；这 4 行的击杀数量会在对应周期各用一遍。
                    </p>
                )}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                    方案
                </div>
                {emptyRound >= 0 ? (
                    <p className="px-3 py-3 text-slate-500">
                        回合{cycleRoundLabel(targetStart, targetEnd, emptyRound)}还没选可击杀数量。
                    </p>
                ) : !plan ? (
                    <p className="px-3 py-3 text-slate-500">
                        没有符合击杀数量、且在目标 {targetStart}
                        {targetStart !== targetEnd ? `–${targetEnd}` : ''} 各周期第 4 回合剑×书达标的方案。
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                            <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                                <th className="px-3 py-1.5 font-medium">回合</th>
                                <th className="px-3 py-1.5 font-medium">回合开始能量</th>
                                <th className="px-3 py-1.5 font-medium">击杀</th>
                                <th className="px-3 py-1.5 font-medium">小怪行动次数</th>
                                <th className="px-3 py-1.5 font-medium">剑</th>
                                <th className="px-3 py-1.5 font-medium">书</th>
                                <th className="px-3 py-1.5 font-medium">下回合开始能量</th>
                            </tr>
                            </thead>
                            <tbody>
                            {plan.map((row, index) => (
                                <Fragment key={row.round}>
                                    {plan.length > 4 && index % 4 === 0 && (
                                        <tr className="bg-slate-50">
                                            <td
                                                colSpan={7}
                                                className="px-3 py-1.5 text-[11px] font-semibold text-slate-500"
                                            >
                                                回合 {row.round}–{row.round + 3} · 剑×书 ={' '}
                                                {TARGET_ROUNDS[startIndex + index / 4]}
                                            </td>
                                        </tr>
                                    )}
                                    <tr className="border-b border-slate-100 last:border-0">
                                        <td className="px-3 py-2 font-mono align-middle">{row.round}</td>
                                        <td className="px-3 py-2 font-mono whitespace-nowrap align-middle">
                                            {row.startEnergy.map((value, index) => `${MOB_MARK[index]}${value}`).join(' ')}
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                            {row.killed.length === 0 ? (
                                                <span className="text-sm text-slate-300">无</span>
                                            ) : (
                                                <span className="inline-flex gap-1">
                                                    {row.killed.map((mob) => (
                                                        <span
                                                            key={mob}
                                                            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md text-lg font-bold leading-none text-white ${MOBS[mob - 1].badge}`}
                                                        >
                                                            {MOB_MARK[mob - 1]}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 font-mono whitespace-nowrap align-middle">
                                            {row.actions.length === 0
                                                ? '—'
                                                : row.actions.map((action) => `${MOB_MARK[action.mob - 1]}×${action.times}`).join(' ')}
                                        </td>
                                        <td className="px-3 py-2 font-mono align-middle">{row.sword}</td>
                                        <td className="px-3 py-2 font-mono whitespace-nowrap align-middle">
                                            {row.book}
                                            {row.bookFromSword && (
                                                <span
                                                    className="ml-1 text-[10px] font-sans text-slate-400">剑&gt;0</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 font-mono whitespace-nowrap align-middle">
                                            {row.nextEnergy.map((value, index) => `${MOB_MARK[index]}${value}`).join(' ')}
                                        </td>
                                    </tr>
                                </Fragment>
                            ))}
                            </tbody>
                        </table>
                        <p className="px-3 py-2 text-[11px] leading-relaxed text-slate-400">
                            {plan
                                .filter((_, index) => index % 4 === 3)
                                .map((row) => `第 ${row.round} 回合剑×书 = ${row.sword}×${row.book} = ${row.sword * row.book}`)
                                .join('。')}
                            。被击杀的小怪本回合不行动，下回合按击杀时的能量复活；未击杀者每回合结束能量 +1。
                            {cycles > 1 ? '剑、书每 4 回合从 0 重计。' : ''}
                        </p>
                    </div>
                )}
            </div>
            </section>
        </div>
    );
}

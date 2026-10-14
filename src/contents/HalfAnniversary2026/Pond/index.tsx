import { ChevronDown, ChevronUp, Shield, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
    appendRoundDraft,
    changeTeamSize,
    completedInputsBeforeRow,
    computeRowsFromDrafts,
    DEFAULT_SPECIALS,
    deleteDraftFrom,
    formatBossEnergy,
    isFullBossEnergy,
    safeRedCircleOptions,
    TEAM_SIZE_MAX,
    TEAM_SIZE_MIN,
    type RowDraft,
    updateLastDraft,
} from './logic';

const TEAM_SIZE_OPTIONS = Array.from(
    { length: TEAM_SIZE_MAX - TEAM_SIZE_MIN + 1 },
    (_, i) => i + TEAM_SIZE_MIN,
);

function Segmented<T extends string | number>({
    options,
    value,
    onPick,
    disabled,
    readOnly,
    format = (v) => String(v),
    isOptionDisabled,
    getOptionClassName,
}: {
    options: readonly T[];
    value: T | null;
    onPick?: (value: T) => void;
    disabled?: boolean;
    readOnly?: boolean;
    format?: (value: T) => string;
    isOptionDisabled?: (value: T) => boolean;
    getOptionClassName?: (value: T, selected: boolean) => string;
}) {
    return (
        <div
            className="inline-flex overflow-hidden rounded border border-slate-200"
            role="radiogroup"
        >
            {options.map((opt) => {
                const selected = value === opt;
                const optionDisabled = disabled || readOnly || (isOptionDisabled?.(opt) ?? false);
                const extra = getOptionClassName?.(opt, selected) ?? '';
                return (
                    <button
                        key={String(opt)}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={optionDisabled}
                        onClick={() => onPick?.(opt)}
                        className={`min-w-8 border-l border-slate-200 px-2 py-1 text-sm font-medium leading-5 first:border-l-0 ${
                            optionDisabled && !readOnly
                                ? 'cursor-not-allowed bg-slate-50 text-slate-300'
                                : selected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-slate-600 hover:bg-slate-50'
                        } ${extra}`}
                    >
                        {format(opt)}
                    </button>
                );
            })}
        </div>
    );
}

function ShieldButtons({
    shields,
}: {
    shields: number[];
}) {
    return (
        <div className="inline-flex flex-wrap gap-1">
            {shields.map((layer, index) => (
                <span
                    key={index}
                    className={`inline-flex min-w-8 items-center justify-center rounded border px-2 py-1 text-sm font-mono tabular-nums ${
                        layer > 0
                            ? 'border-red-300 bg-red-50 text-red-700 font-semibold'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                >
                    {layer}
                </span>
            ))}
        </div>
    );
}

function CompactCollapsible({
    title,
    open,
    onToggle,
    info,
    children,
}: {
    title: string;
    open: boolean;
    onToggle: () => void;
    info?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="rounded border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <h2 className="text-base font-bold text-slate-900">{title}</h2>
                <button
                    type="button"
                    onClick={onToggle}
                    className="shrink-0 p-0.5 text-slate-500 hover:text-slate-800"
                    aria-expanded={open}
                    aria-label={open ? '收起' : '展开'}
                >
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>
            {open ? (
                <>
                    {info}
                    <div className="space-y-2 px-3 py-2">{children}</div>
                </>
            ) : null}
        </section>
    );
}

function UsagePanel() {
    return (
        <div className="mx-2 mt-2 mb-1 rounded-lg border border-sky-200 bg-sky-50/90 overflow-hidden">
            <div className="border-b border-sky-200/80 bg-sky-100/70 px-4 py-2.5">
                <h3 className="text-sm font-bold text-sky-950">使用说明</h3>
            </div>
            <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed">
                <p>
                    控制我方
                    <span className="font-semibold text-red-600">红圈位置</span>
                    ，来调整
                    <span className="font-semibold text-red-600">红盾情况</span>
                    ，避免回合结束时，因为有
                    <span className="font-bold text-red-700">≥3人</span>
                    拥有
                    <span className="font-bold text-red-700">相同</span>
                    且
                    <span className="font-bold text-red-700">&gt;0层</span>
                    的红盾而被秒杀。
                </p>
                <ol className="mt-3 list-none space-y-2.5 pl-0">
                    <li>
                        <span className="font-semibold text-indigo-700">①</span>{' '}
                        输入
                        <span className="font-semibold text-slate-900">队伍人数</span>
                    </li>
                    <li>
                        <span className="font-semibold text-indigo-700">②</span>{' '}
                        <span className="font-semibold text-amber-700">boss 能量 = 4</span>
                        的回合，根据当前情况点亮：
                        <ul className="mt-1.5 space-y-1 pl-4 text-slate-600">
                            <li>
                                <span className="text-slate-400">△</span>{' '}
                                <span className="font-semibold text-emerald-700">沉吟</span>
                                ：被曹植技能沉吟（绿剑）
                            </li>
                            <li>
                                <span className="text-slate-400">△</span>{' '}
                                <span className="font-semibold text-violet-700">沉默</span>
                                ：被小乔 / 觉醒贾诩等沉默
                            </li>
                            <li>
                                <span className="text-slate-400">△</span>{' '}
                                <span className="font-semibold text-sky-700">≥3 人防御状态</span>
                                ：若我方会有 ≥3 人处于防御状态（透明盾牌），就点亮
                            </li>
                        </ul>
                    </li>
                    <li>
                        <span className="font-semibold text-indigo-700">③</span>{' '}
                        <span className="font-semibold text-red-600">「红圈位置」</span>
                        列会显示
                        <span className="font-semibold text-slate-900">可以拿红圈</span>
                        的密探
                    </li>
                    <li>
                        <span className="font-semibold text-indigo-700">④</span>{' '}
                        选择一名密探，让他
                        <span className="font-semibold text-indigo-800">第一个下拉</span>
                        拿到红圈，并在表格里
                        <span className="font-semibold text-red-600">点亮</span>
                        他
                    </li>
                    <li>
                        <span className="font-semibold text-indigo-700">⑤</span>{' '}
                        点
                        <span className="font-mono font-bold text-indigo-700">+</span>{' '}
                        新建回合
                    </li>
                </ol>
            </div>
        </div>
    );
}

function SpecialToggle({
    label,
    checked,
    onChange,
    disabled,
    icon,
}: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    icon?: ReactNode;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={checked}
            onClick={() => onChange(!checked)}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-sm font-medium transition-colors ${
                disabled
                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                    : checked
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

export default function HalfAnniversary2026Pond() {
    const [stageOneOpen, setStageOneOpen] = useState(true);
    const [teamSize, setTeamSize] = useState(5);
    const [drafts, setDrafts] = useState<RowDraft[]>(() => [
        { redCircle: null, specials: { ...DEFAULT_SPECIALS } },
    ]);

    const rows = useMemo(
        () => computeRowsFromDrafts(teamSize, drafts),
        [teamSize, drafts],
    );

    const lastIndex = rows.length - 1;

    const handleTeamSize = (size: number) => {
        const next = changeTeamSize(size);
        setTeamSize(next.teamSize);
        setDrafts(next.drafts);
    };

    const handleAdd = () => {
        setDrafts((prev) => appendRoundDraft(prev, teamSize));
    };

    const handleDelete = (index: number) => {
        setDrafts((prev) => deleteDraftFrom(prev, index));
    };

    const handleRedCircle = (pos: number) => {
        setDrafts((prev) => updateLastDraft(prev, { redCircle: pos }));
    };

    const handleSpecial = (key: 'chant' | 'silence' | 'def3', value: boolean) => {
        setDrafts((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return prev;
            return updateLastDraft(prev, {
                specials: { ...last.specials, [key]: value },
            });
        });
    };

    return (
        <div className="space-y-2">
            <CompactCollapsible
                title="阶段一"
                open={stageOneOpen}
                onToggle={() => setStageOneOpen((v) => !v)}
                info={<UsagePanel />}
            >
                <div>
                    <p className="mb-1 text-sm font-semibold text-slate-700">队伍人数</p>
                    <Segmented
                        options={TEAM_SIZE_OPTIONS}
                        value={teamSize}
                        onPick={handleTeamSize}
                    />
                </div>

                <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full min-w-[640px] text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-700">
                            <th className="px-3 py-1.5 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                回合
                            </th>
                            <th className="px-3 py-1.5 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                boss能量
                            </th>
                            <th className="px-3 py-1.5 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                红盾情况
                            </th>
                            <th className="px-3 py-1.5 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                特殊情况
                            </th>
                            <th className="px-3 py-1.5 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                红圈位置
                            </th>
                            <th className="px-3 py-1.5 border-b border-slate-200 w-24" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => {
                            const isLast = index === lastIndex;
                            const positionOptions = Array.from(
                                { length: teamSize },
                                (_, i) => i + 1,
                            );
                            const completed = completedInputsBeforeRow(rows, index);
                            const safeFlags = isLast
                                ? safeRedCircleOptions(
                                      teamSize,
                                      completed,
                                      row.specials,
                                  )
                                : [];
                            const redIdx =
                                row.redCircle != null ? row.redCircle - 1 : -1;
                            const canAdd =
                                isLast &&
                                row.redCircle != null &&
                                !row.wiped &&
                                (safeFlags[redIdx] ?? false);

                            return (
                                <tr
                                    key={`${row.round}-${index}`}
                                    className="border-b border-slate-100 last:border-0 bg-white"
                                >
                                    <td className="px-3 py-1.5 font-mono text-slate-800">
                                        {row.round}
                                        {row.wiped ? (
                                            <span className="ml-2 text-sm font-bold text-red-600">
                                                秒杀
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-slate-800">
                                        {formatBossEnergy(row.bossEnergy)}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <ShieldButtons shields={row.shields} />
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {isFullBossEnergy(row.bossEnergy) ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                <SpecialToggle
                                                    label="沉吟"
                                                    checked={row.specials.chant}
                                                    onChange={(v) =>
                                                        isLast && handleSpecial('chant', v)
                                                    }
                                                    disabled={!isLast}
                                                />
                                                <SpecialToggle
                                                    label="沉默"
                                                    checked={row.specials.silence}
                                                    onChange={(v) =>
                                                        isLast && handleSpecial('silence', v)
                                                    }
                                                    disabled={!isLast}
                                                />
                                                <SpecialToggle
                                                    label="≥3人防御"
                                                    checked={row.specials.def3}
                                                    onChange={(v) =>
                                                        isLast && handleSpecial('def3', v)
                                                    }
                                                    disabled={!isLast}
                                                    icon={
                                                        <Shield
                                                            size={12}
                                                            className="shrink-0 opacity-80"
                                                        />
                                                    }
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {isLast ? (
                                            <Segmented
                                                options={positionOptions}
                                                value={row.redCircle}
                                                onPick={handleRedCircle}
                                                isOptionDisabled={(pos) => {
                                                    const idx = pos - 1;
                                                    return safeFlags[idx] === false;
                                                }}
                                            />
                                        ) : (
                                            <Segmented
                                                options={
                                                    row.redCircle != null
                                                        ? [row.redCircle]
                                                        : []
                                                }
                                                value={row.redCircle}
                                                readOnly
                                            />
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <div className="flex items-center gap-1">
                                            {isLast ? (
                                                <button
                                                    type="button"
                                                    onClick={handleAdd}
                                                    disabled={!canAdd}
                                                    className="px-2.5 py-1 rounded border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                                    aria-label="进入下一回合"
                                                >
                                                    +
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(index)}
                                                className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                                aria-label="删除本行及之后"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                </div>
            </CompactCollapsible>
        </div>
    );
}

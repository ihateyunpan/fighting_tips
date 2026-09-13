import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    Copy,
    Plus,
    RotateCcw,
    Swords,
    Trash2,
    Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLevelToolbar } from '../../../components/LevelContext';
import {
    advanceColor,
    applyPulls,
    cloneRoundConstraints,
    COLOR_LABEL,
    createInitialSnapshot,
    defaultRoundConstraints,
    defaultSlotConstraint,
    deriveNextColors,
    deriveNextRound,
    findShortestElimination,
    formatSlotConstraint,
    hasAnySeal,
    type DualSnakePersonIndex,
    type PullPlan,
    resizeColors,
    resizeRoundConstraints,
    type RoundConstraints,
    type RoundSnapshot,
    type SealColor,
    SEAL_COLORS,
    type Seals,
    type SlotConstraint,
    TARGET_LABEL,
} from './stage1Logic';
import {
    createInitialStage2Snapshot,
    deriveNextLayers,
    deriveNextStage2Round,
    findAvoidExitPlans,
    type Stage2RoundSnapshot,
    toStage2Snapshot,
} from './stage2Logic';

const STORAGE_KEY_STAGE1 = 'yuan2026-l3-stage1-v4';
const STORAGE_KEY_STAGE2 = 'yuan2026-l3-stage2-v5';
const STORAGE_KEY_PULL_REQ = 'yuan2026-l3-pull-req-v4';
const STORAGE_KEY_TEAM_SIZE = 'yuan2026-l3-team-size-v1';
const STORAGE_KEY_DUAL_SNAKE = 'yuan2026-l3-dual-snake-v1';
const EXPORT_VERSION = 'yuan2026-l3-v5';
const TEAM_SIZE_OPTIONS = [1, 2, 3, 4, 5] as const;

interface DualSnakeState {
    enabled: boolean;
    /** 0-based；仅 enabled 时有效 */
    personIndex: number;
}

const DEFAULT_DUAL_SNAKE: DualSnakeState = { enabled: false, personIndex: 0 };

function effectiveDualSnake(
    teamSize: number,
    dualSnake: DualSnakeState,
): DualSnakePersonIndex {
    if (teamSize >= 5 || !dualSnake.enabled) return null;
    const max = Math.max(0, teamSize - 1);
    return Math.min(max, Math.max(0, Math.floor(dualSnake.personIndex)));
}

function useStickyState<T>(
    defaultValue: T,
    key: string,
): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [value, setValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : defaultValue;
        } catch {
            return defaultValue;
        }
    });
    useEffect(() => {
        window.localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);
    return [value, setValue];
}

// --- 样式 ---

const COLOR_BTN: Record<SealColor, string> = {
    red: 'bg-red-500 hover:bg-red-600 text-white border-red-600',
    blue: 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600',
    green: 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600',
};

const COLOR_BTN_LOCKED: Record<SealColor, string> = {
    red: 'bg-red-500 text-white border-red-600 cursor-default',
    blue: 'bg-blue-500 text-white border-blue-600 cursor-default',
    green: 'bg-emerald-500 text-white border-emerald-600 cursor-default',
};

const SWORD_ICON: Record<SealColor, string> = {
    red: 'text-red-500',
    blue: 'text-blue-500',
    green: 'text-emerald-500',
};

const generateId = () => Math.random().toString(36).slice(2, 11);

function pullReqDomId(roundNumber: number) {
    return `yuan-l3-pull-req-${roundNumber}`;
}

function colorRoundDomId(roundNumber: number) {
    return `yuan-l3-color-round-${roundNumber}`;
}

interface AfterActionSnapshot {
    colors: SealColor[];
    pulls: number[];
}

interface RoundData {
    id: string;
    snapshot: RoundSnapshot;
    after: AfterActionSnapshot;
    afterHistory: AfterActionSnapshot[];
    isCollapsed: boolean;
}

interface Stage2RoundData {
    id: string;
    snapshot: Stage2RoundSnapshot;
    after: AfterActionSnapshot;
    afterHistory: AfterActionSnapshot[];
    isCollapsed: boolean;
    pullRequirements: RoundConstraints;
}

interface PullReqRow {
    id: string;
    slots: RoundConstraints;
}

function freshAfter(
    colors: SealColor[],
    defaultPulls?: number[],
): AfterActionSnapshot {
    const pulls = colors.map((_, i) =>
        Math.max(0, Math.floor(defaultPulls?.[i] ?? 0)),
    );
    return { colors: applyPulls(colors, pulls), pulls };
}

function pullsFromConstraints(constraints: RoundConstraints): number[] {
    return constraints.map((c) => Math.max(0, Math.floor(c.min)));
}

function createRound(
    snapshot: RoundSnapshot,
    expanded: boolean,
    defaultPulls?: number[],
): RoundData {
    return {
        id: generateId(),
        snapshot,
        after: freshAfter(snapshot.startColors, defaultPulls),
        afterHistory: [],
        isCollapsed: !expanded,
    };
}

function createStage2Round(
    snapshot: Stage2RoundSnapshot,
    expanded: boolean,
    pullRequirements?: RoundConstraints,
): Stage2RoundData {
    const teamSize = snapshot.startColors.length;
    return {
        id: generateId(),
        snapshot,
        after: freshAfter(snapshot.startColors),
        afterHistory: [],
        isCollapsed: !expanded,
        pullRequirements: pullRequirements
            ? resizeRoundConstraints(pullRequirements, teamSize)
            : defaultRoundConstraints(teamSize),
    };
}

function createPullReqRow(teamSize: number): PullReqRow {
    return {
        id: generateId(),
        slots: defaultRoundConstraints(teamSize),
    };
}

/** 操作要求表第 1 行对应初始回合编号，之后依次 +1；超出表长则默认 0~1 */
function lookupRoundConstraints(
    rows: PullReqRow[],
    roundNumber: number,
    teamSize: number,
    baseRoundNumber = 1,
): RoundConstraints {
    const rowIndex = roundNumber - baseRoundNumber;
    const row = rowIndex >= 0 ? rows[rowIndex] : undefined;
    return row
        ? resizeRoundConstraints(row.slots, teamSize)
        : defaultRoundConstraints(teamSize);
}

function sameColors(a: SealColor[], b: SealColor[]): boolean {
    return a.length === b.length && a.every((c, i) => c === b[i]);
}

function sameStage1Snapshot(a: RoundSnapshot, b: RoundSnapshot): boolean {
    return (
        a.roundNumber === b.roundNumber &&
        a.energy === b.energy &&
        a.energyMax === b.energyMax &&
        a.seals.red === b.seals.red &&
        a.seals.blue === b.seals.blue &&
        a.seals.green === b.seals.green &&
        sameColors(a.startColors, b.startColors)
    );
}

function sameStage2Snapshot(a: Stage2RoundSnapshot, b: Stage2RoundSnapshot): boolean {
    return (
        a.roundNumber === b.roundNumber &&
        a.energy === b.energy &&
        a.energyMax === b.energyMax &&
        a.bossLayers === b.bossLayers &&
        a.seals.red === b.seals.red &&
        a.seals.blue === b.seals.blue &&
        a.seals.green === b.seals.green &&
        sameColors(a.startColors, b.startColors)
    );
}

function cascadeStage1Rounds(
    rounds: RoundData[],
    fromIndex: number,
    getDefaultPulls: (roundNumber: number) => number[],
    dualSnakePersonIndex: DualSnakePersonIndex = null,
): RoundData[] {
    if (rounds.length <= 1 || fromIndex >= rounds.length - 1) return rounds;
    const next = [...rounds];
    for (let i = fromIndex; i < next.length - 1; i++) {
        const prev = next[i]!;
        const derived = deriveNextRound(
            prev.snapshot,
            prev.after.colors,
            dualSnakePersonIndex,
        );
        const curr = next[i + 1]!;
        if (sameStage1Snapshot(curr.snapshot, derived)) break;
        next[i + 1] = {
            ...curr,
            snapshot: derived,
            after: freshAfter(
                derived.startColors,
                getDefaultPulls(derived.roundNumber),
            ),
            afterHistory: [],
        };
    }
    return next;
}

function cascadeStage2Rounds(
    rounds: Stage2RoundData[],
    fromIndex: number,
    dualSnakePersonIndex: DualSnakePersonIndex = null,
): Stage2RoundData[] {
    if (rounds.length <= 1 || fromIndex >= rounds.length - 1) return rounds;
    const next = [...rounds];
    for (let i = fromIndex; i < next.length - 1; i++) {
        const prev = next[i]!;
        const derived = deriveNextStage2Round(
            prev.snapshot,
            prev.after.colors,
            dualSnakePersonIndex,
        );
        const curr = next[i + 1]!;
        if (sameStage2Snapshot(curr.snapshot, derived)) break;
        next[i + 1] = {
            ...curr,
            snapshot: derived,
            after: freshAfter(derived.startColors),
            afterHistory: [],
        };
    }
    return next;
}

function collapseOthers<T extends { id: string; isCollapsed: boolean }>(
    rounds: T[],
    expandedId: string,
): T[] {
    return rounds.map((r) =>
        r.id === expandedId ? r : { ...r, isCollapsed: true },
    );
}

function parseNonNegInt(raw: string): number | null {
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
}

// --- 小组件 ---

function SealIcons({ seals }: { seals: Seals }) {
    const present = SEAL_COLORS.filter((c) => seals[c]);
    if (present.length === 0) {
        return <span className="text-sm text-slate-400">无封印</span>;
    }
    return (
        <div className="flex items-center gap-1.5">
            {present.map((c) => (
                <Swords
                    key={c}
                    size={20}
                    className={SWORD_ICON[c]}
                    aria-label={`${COLOR_LABEL[c]}剑封印`}
                />
            ))}
        </div>
    );
}

/** 三色封印开关：激活 = 封印仍在 */
function SealToggleButtons({
    seals,
    disabled,
    onToggle,
}: {
    seals: Seals;
    disabled?: boolean;
    onToggle?: (color: SealColor) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 shrink-0">还剩的封印</span>
            <div className="flex flex-wrap gap-1.5">
                {SEAL_COLORS.map((c) => {
                    const active = seals[c];
                    const editable = !disabled && !!onToggle;
                    return (
                        <button
                            key={c}
                            type="button"
                            disabled={!editable}
                            aria-pressed={active}
                            aria-label={`${COLOR_LABEL[c]}剑封印${active ? '（仍在）' : '（已解除）'}`}
                            title={`${COLOR_LABEL[c]}剑：${active ? '仍在，点击解除' : '已解除，点击恢复'}`}
                            onClick={() => onToggle?.(c)}
                            className={`w-10 h-10 rounded-lg border-2 inline-flex items-center justify-center transition-colors ${
                                active
                                    ? `bg-white ${SWORD_ICON[c]} border-slate-300`
                                    : 'bg-slate-100 text-slate-300 border-slate-200'
                            } ${editable ? 'hover:bg-slate-50' : ''} disabled:cursor-default`}
                        >
                            <Swords size={20} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ColorButton({
    color,
    label,
    disabled,
    onClick,
}: {
    color: SealColor;
    label?: string;
    disabled?: boolean;
    onClick?: () => void;
}) {
    const cls = disabled ? COLOR_BTN_LOCKED[color] : COLOR_BTN[color];
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`w-12 h-12 rounded-lg border-2 font-bold text-xs shadow-sm transition-transform active:scale-95 disabled:active:scale-100 disabled:opacity-90 ${cls}`}
        >
            {label ?? COLOR_LABEL[color]}
        </button>
    );
}

function SlotConstraintEditor({
    value,
    onChange,
}: {
    value: SlotConstraint;
    onChange: (next: SlotConstraint) => void;
}) {
    return (
        <div className="flex items-center gap-1 min-w-[6.5rem]">
            <input
                type="number"
                min={0}
                step={1}
                value={value.min}
                onChange={(e) => {
                    const n = parseNonNegInt(e.target.value);
                    if (n == null) return;
                    onChange({ min: n, max: Math.max(n, value.max) });
                }}
                className="w-full rounded-md border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="最小下拉次数"
            />
            <span className="text-slate-400 text-xs shrink-0">~</span>
            <input
                type="number"
                min={0}
                step={1}
                value={value.max}
                onChange={(e) => {
                    const n = parseNonNegInt(e.target.value);
                    if (n == null) return;
                    onChange({ min: Math.min(value.min, n), max: n });
                }}
                className="w-full rounded-md border border-slate-200 px-1.5 py-1 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="最大下拉次数"
            />
        </div>
    );
}

function SlotConstraintEditors({
    constraints,
    onChange,
}: {
    constraints: RoundConstraints;
    onChange: (next: RoundConstraints) => void;
}) {
    return (
        <div className="flex flex-wrap gap-3">
            {constraints.map((slot, i) => (
                <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 shrink-0">{i + 1}号</span>
                    <SlotConstraintEditor
                        value={slot}
                        onChange={(next) => {
                            const copy = cloneRoundConstraints(constraints);
                            copy[i] = next;
                            onChange(copy);
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

function SlotConstraintsReadonly({ constraints }: { constraints: RoundConstraints }) {
    return (
        <div className="flex flex-wrap gap-2">
            {constraints.map((slot, i) => (
                <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                >
                    <span className="text-slate-400">{i + 1}号</span>
                    <span className="font-mono font-medium">{formatSlotConstraint(slot)}</span>
                </span>
            ))}
        </div>
    );
}

function DualSnakePositionPicker({
    teamSize,
    value,
    onChange,
}: {
    teamSize: number;
    value: number;
    onChange: (personIndex: number) => void;
}) {
    const square = 22;
    const gap = 3;
    return (
        <div className="flex flex-wrap gap-3">
            {Array.from({ length: teamSize }, (_, snakeAt) => {
                const selected = value === snakeAt;
                return (
                    <button
                        key={snakeAt}
                        type="button"
                        onClick={() => onChange(snakeAt)}
                        className={`rounded-lg border-2 px-2.5 py-2 transition-colors ${
                            selected
                                ? 'border-amber-500 bg-amber-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                        aria-pressed={selected}
                        aria-label={`双蛇在${snakeAt + 1}号位`}
                        title={`双蛇在${snakeAt + 1}号位`}
                    >
                        <div
                            className="flex items-stretch"
                            style={{ height: square, gap }}
                        >
                            {Array.from({ length: teamSize }, (_, slot) => {
                                const isDual = slot === snakeAt;
                                return (
                                    <div
                                        key={slot}
                                        className={`h-full rounded-sm border ${
                                            isDual
                                                ? 'border-amber-700 bg-amber-500'
                                                : 'border-slate-400 bg-slate-200'
                                        }`}
                                        style={{
                                            width: isDual ? square * 2 : square,
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function PlanTable({
    snapshot,
    getConstraints,
    onApplyPlan,
    dualSnakePersonIndex,
}: {
    snapshot: RoundSnapshot;
    getConstraints: (roundNumber: number) => RoundConstraints;
    onApplyPlan: (plan: PullPlan) => void;
    dualSnakePersonIndex: DualSnakePersonIndex;
}) {
    const teamSize = snapshot.startColors.length;

    const rows = useMemo(() => {
        return SEAL_COLORS.map((target) => {
            if (!snapshot.seals[target]) {
                return { target, plan: null, pathLength: null, disabled: true };
            }
            const result = findShortestElimination(
                snapshot,
                target,
                getConstraints,
                dualSnakePersonIndex,
            );
            return {
                target,
                plan: result?.firstPulls ?? null,
                pathLength: result?.pathLength ?? null,
                disabled: false,
            };
        });
    }, [snapshot, getConstraints, dualSnakePersonIndex]);

    const slots = Array.from({ length: teamSize }, (_, i) => i);

    return (
        <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600">
                            <th className="px-3 py-2 text-left font-semibold border-b border-slate-200">
                                目标
                            </th>
                            {slots.map((i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2 text-center font-semibold border-b border-slate-200 whitespace-nowrap"
                                >
                                    {i + 1}号位
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr
                                key={row.target}
                                className={`border-b border-slate-100 last:border-0 ${
                                    row.disabled
                                        ? 'bg-slate-50 text-slate-400'
                                        : 'bg-white text-slate-800'
                                }`}
                            >
                                <td
                                    className={`px-3 py-2 font-medium ${
                                        row.disabled ? 'line-through' : ''
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{TARGET_LABEL[row.target]}</span>
                                        {!row.disabled && row.plan && (
                                            <button
                                                type="button"
                                                onClick={() => onApplyPlan(row.plan!)}
                                                className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                aria-label="同步方案到行动"
                                                title="同步方案到行动"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {!row.disabled && row.pathLength != null && (
                                        <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                                            最短 {row.pathLength} 回合
                                        </div>
                                    )}
                                    {!row.disabled && row.plan == null && (
                                        <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                                            无可行方案
                                        </div>
                                    )}
                                </td>
                                {slots.map((i) => (
                                    <td
                                        key={i}
                                        className={`px-3 py-2 text-center font-mono ${
                                            row.disabled ? '' : 'text-slate-700'
                                        }`}
                                    >
                                        {row.disabled || !row.plan ? (
                                            <span className="opacity-40">—</span>
                                        ) : (
                                            `↓×${row.plan[i]}`
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="text-xs text-slate-500 leading-relaxed space-y-1">
                <p>
                    ① 如果本回合不想解锁任何剑，
                    <strong className="font-bold text-red-600">避开</strong>
                    上表中任何「最短 1 回合」的方案
                </p>
                <p>② 快打死 boss 时，开始解剑</p>
            </div>
        </div>
    );
}

function Stage2PlanTable({
    snapshot,
    constraints,
    onApplyPlan,
    dualSnakePersonIndex,
}: {
    snapshot: Stage2RoundSnapshot;
    constraints: RoundConstraints;
    onApplyPlan: (plan: PullPlan) => void;
    dualSnakePersonIndex: DualSnakePersonIndex;
}) {
    const teamSize = snapshot.startColors.length;
    const plans = useMemo(
        () => findAvoidExitPlans(snapshot, constraints, dualSnakePersonIndex),
        [snapshot, constraints, dualSnakePersonIndex],
    );
    const slots = Array.from({ length: teamSize }, (_, i) => i);

    return (
        <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600">
                            <th className="px-3 py-2 text-left font-semibold border-b border-slate-200">
                                目标
                            </th>
                            {slots.map((i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2 text-center font-semibold border-b border-slate-200 whitespace-nowrap"
                                >
                                    {i + 1}号位
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {plans.length === 0 ? (
                            <tr className="bg-slate-50 text-slate-400">
                                <td className="px-3 py-2 font-medium">避免退场</td>
                                {slots.map((i) => (
                                    <td key={i} className="px-3 py-2 text-center font-mono">
                                        <span className="opacity-40">—</span>
                                    </td>
                                ))}
                            </tr>
                        ) : (
                            plans.map((plan, planIndex) => (
                                <tr
                                    key={plan.join(',')}
                                    className="bg-white text-slate-800 border-b border-slate-100 last:border-0"
                                >
                                    <td className="px-3 py-2 font-medium">
                                        <div className="flex items-center gap-2">
                                            <span>
                                                避免退场
                                                {plans.length > 1 ? ` #${planIndex + 1}` : ''}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onApplyPlan(plan)}
                                                className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                aria-label="同步方案到行动"
                                                title="同步方案到行动"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>
                                    </td>
                                    {slots.map((i) => (
                                        <td
                                            key={i}
                                            className="px-3 py-2 text-center font-mono text-slate-700"
                                        >
                                            ↓×{plan[i]}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function NumberField({
    label,
    value,
    min,
    onChange,
    disabled,
}: {
    label: string;
    value: number;
    min: number;
    onChange?: (n: number) => void;
    disabled?: boolean;
}) {
    return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="shrink-0">{label}</span>
            {disabled || !onChange ? (
                <span className="font-mono font-bold text-slate-800">{value}</span>
            ) : (
                <input
                    type="number"
                    min={min}
                    value={value}
                    onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        onChange(Math.max(min, Math.floor(n)));
                    }}
                    className="w-16 rounded-md border border-slate-200 px-2 py-1 font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
            )}
        </label>
    );
}

const STAGE1_ENERGY_OPTIONS = [1, 2, 3, 4, 5] as const;
const STAGE1_ENERGY_CAP = 5;
const STAGE2_ENERGY_OPTIONS = [1, 2, 3, 4] as const;
const STAGE2_ENERGY_CAP = 4;

/** 阶段一能量 / 上限限制在 1–5，且能量不超过上限 */
function clampStage1EnergyFields(
    energy: number,
    energyMax: number,
): { energy: number; energyMax: number } {
    const max = Math.min(
        STAGE1_ENERGY_CAP,
        Math.max(1, Math.floor(energyMax)),
    );
    const e = Math.min(max, Math.max(1, Math.floor(energy)));
    return { energy: e, energyMax: max };
}

/** 阶段二能量 / 上限限制在 1–4，且能量不超过上限 */
function clampStage2EnergyFields(
    energy: number,
    energyMax: number,
): { energy: number; energyMax: number } {
    const max = Math.min(
        STAGE2_ENERGY_CAP,
        Math.max(1, Math.floor(energyMax)),
    );
    const e = Math.min(max, Math.max(1, Math.floor(energy)));
    return { energy: e, energyMax: max };
}

function EnergyChoiceButtons({
    label,
    value,
    options,
    disabled,
    isOptionDisabled,
    onChange,
}: {
    label: string;
    value: number;
    options: readonly number[];
    disabled?: boolean;
    isOptionDisabled?: (n: number) => boolean;
    onChange?: (n: number) => void;
}) {
    return (
        <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="shrink-0">{label}</span>
            <div className="flex flex-wrap gap-1.5">
                {options.map((n) => {
                    const optionDisabled =
                        disabled || !onChange || (isOptionDisabled?.(n) ?? false);
                    const selected = value === n;
                    return (
                        <button
                            key={n}
                            type="button"
                            disabled={optionDisabled}
                            onClick={() => onChange?.(n)}
                            aria-pressed={selected}
                            className={`w-9 h-9 rounded-lg border-2 text-sm font-bold transition-colors ${
                                selected
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            } disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed`}
                        >
                            {n}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Hl({ children }: { children: ReactNode }) {
    return (
        <mark className="bg-amber-100 text-amber-950 font-semibold px-0.5 rounded-sm not-italic">
            {children}
        </mark>
    );
}

function PullRequirementsSection({
    teamSize,
    rows,
    baseRoundNumber,
    colorRoundNumbers,
    onChangeRows,
    onJumpToColor,
}: {
    teamSize: number;
    rows: PullReqRow[];
    baseRoundNumber: number;
    colorRoundNumbers: Set<number>;
    onChangeRows: (next: PullReqRow[]) => void;
    onJumpToColor: (roundNumber: number) => void;
}) {
    const [deletedStack, setDeletedStack] = useState<{
        row: PullReqRow;
        index: number;
    } | null>(null);

    const updateRowSlots = (id: string, slots: RoundConstraints) => {
        onChangeRows(rows.map((r) => (r.id === id ? { ...r, slots } : r)));
    };

    const addRow = () => {
        onChangeRows([...rows, createPullReqRow(teamSize)]);
    };

    const copyAddRow = () => {
        const last = rows[rows.length - 1];
        if (!last) {
            onChangeRows([createPullReqRow(teamSize)]);
            return;
        }
        onChangeRows([
            ...rows,
            {
                id: generateId(),
                slots: resizeRoundConstraints(last.slots, teamSize),
            },
        ]);
    };

    const deleteRow = (id: string) => {
        if (rows.length <= 1) return;
        const index = rows.findIndex((r) => r.id === id);
        if (index < 0) return;
        const target = rows[index]!;
        setDeletedStack({ row: target, index });
        onChangeRows(rows.filter((r) => r.id !== id));
    };

    const undoDelete = () => {
        if (!deletedStack) return;
        const { row, index } = deletedStack;
        setDeletedStack(null);
        const next = [...rows];
        next.splice(Math.min(index, next.length), 0, row);
        onChangeRows(next);
    };

    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed">
                每位输入框：左侧为下拉次数下限，右侧为上限（如 0~1 表示该号位本回合可下拉 0 或 1 次）。
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600">
                            <th className="px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">
                                回合
                            </th>
                            {Array.from({ length: teamSize }, (_, i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2 text-center font-semibold border-b border-slate-200 whitespace-nowrap"
                                >
                                    {i + 1}号位
                                </th>
                            ))}
                            <th className="px-3 py-2 text-center font-semibold border-b border-slate-200 w-16">
                                操作
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => {
                            const roundNumber = baseRoundNumber + rowIndex;
                            return (
                                <tr
                                    key={row.id}
                                    id={pullReqDomId(roundNumber)}
                                    className="border-b border-slate-100 last:border-0 bg-white align-middle"
                                >
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-mono font-bold text-slate-800 w-8">
                                                {roundNumber}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={!colorRoundNumbers.has(roundNumber)}
                                                onClick={() => onJumpToColor(roundNumber)}
                                                className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                                aria-label="跳转到颜色变化推断对应回合"
                                                title="跳转到颜色变化推断对应回合"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>
                                    </td>
                                    {Array.from({ length: teamSize }, (_, i) => (
                                        <td key={i} className="px-2 py-2">
                                            <div className="flex justify-center">
                                                <SlotConstraintEditor
                                                    value={
                                                        row.slots[i] ?? defaultSlotConstraint()
                                                    }
                                                    onChange={(next) => {
                                                        const slots = resizeRoundConstraints(
                                                            row.slots,
                                                            teamSize,
                                                        );
                                                        slots[i] = next;
                                                        updateRowSlots(row.id, slots);
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    ))}
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => deleteRow(row.id)}
                                            disabled={rows.length <= 1}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                            aria-label="删除行"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
                >
                    <Plus size={16} />
                    新增行
                </button>
                <button
                    type="button"
                    onClick={copyAddRow}
                    disabled={rows.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                    <Copy size={16} />
                    复制新增
                </button>
                <button
                    type="button"
                    onClick={undoDelete}
                    disabled={!deletedStack}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                    <Undo2 size={16} />
                    撤销删除
                </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
                第 1 行对应上方「初始状态设置」中的回合编号，其后各行依次 +1。回合编号旁的「↓」可跳转到下方「颜色变化推断」中相同回合号的行（若存在）。
            </p>
        </div>
    );
}

function Stage1InitialSetup({
    snapshot,
    onChangeMeta,
    onToggleSeal,
    onChangeStartColor,
}: {
    snapshot: RoundSnapshot;
    onChangeMeta: (
        patch: Partial<Pick<RoundSnapshot, 'roundNumber' | 'energy' | 'energyMax'>>,
    ) => void;
    onToggleSeal: (color: SealColor) => void;
    onChangeStartColor: (index: number) => void;
}) {
    return (
        <div className="space-y-5">
            <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">状态</div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <SealToggleButtons seals={snapshot.seals} onToggle={onToggleSeal} />
                    <NumberField
                        label="回合"
                        value={snapshot.roundNumber}
                        min={1}
                        onChange={(roundNumber) => onChangeMeta({ roundNumber })}
                    />
                    <EnergyChoiceButtons
                        label="Boss 能量"
                        value={snapshot.energy}
                        options={STAGE1_ENERGY_OPTIONS}
                        isOptionDisabled={(n) => n > snapshot.energyMax}
                        onChange={(energy) => onChangeMeta({ energy })}
                    />
                    <EnergyChoiceButtons
                        label="能量上限"
                        value={snapshot.energyMax}
                        options={STAGE1_ENERGY_OPTIONS}
                        onChange={(energyMax) => {
                            onChangeMeta(
                                clampStage1EnergyFields(snapshot.energy, energyMax),
                            );
                        }}
                    />
                </div>
            </div>
            <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">
                    回合开始密探印记
                </div>
                <div className="flex flex-wrap gap-2">
                    {snapshot.startColors.map((color, i) => (
                        <ColorButton
                            key={i}
                            color={color}
                            onClick={() => onChangeStartColor(i)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function RoundPanel({
    round,
    roundConstraints,
    onToggle,
    onDelete,
    onPull,
    onUndoPull,
    onApplyPlan,
    getConstraints,
    onJumpToPullReq,
    canDelete,
    dualSnakePersonIndex,
}: {
    round: RoundData;
    roundConstraints: RoundConstraints;
    onToggle: () => void;
    onDelete: () => void;
    onPull: (index: number) => void;
    onUndoPull: () => void;
    onApplyPlan: (plan: PullPlan) => void;
    getConstraints: (roundNumber: number) => RoundConstraints;
    onJumpToPullReq: () => void;
    canDelete: boolean;
    dualSnakePersonIndex: DualSnakePersonIndex;
}) {
    const { snapshot, after } = round;

    const nextPreviewColors = useMemo(
        () =>
            deriveNextColors(
                after.colors,
                snapshot.roundNumber,
                snapshot.energy,
                snapshot.energyMax,
                snapshot.seals,
                true,
                dualSnakePersonIndex,
            ),
        [after.colors, snapshot, dualSnakePersonIndex],
    );

    return (
        <div
            id={colorRoundDomId(snapshot.roundNumber)}
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4"
        >
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center gap-2">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={onToggle}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                        aria-label={round.isCollapsed ? '展开' : '折叠'}
                    >
                        {round.isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <span className="font-bold text-slate-800">第 {snapshot.roundNumber} 回合</span>
                    <span className="text-xs text-slate-500 truncate">
                        能量 {snapshot.energy}/{snapshot.energyMax}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onDelete}
                    disabled={!canDelete}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    aria-label="删除回合"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {!round.isCollapsed && (
                <div className="p-4 space-y-5">
                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">状态</div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">封印</span>
                                <SealIcons seals={snapshot.seals} />
                            </div>
                            <NumberField
                                label="回合"
                                value={snapshot.roundNumber}
                                min={1}
                                disabled
                            />
                            <NumberField
                                label="Boss 能量"
                                value={snapshot.energy}
                                min={0}
                                disabled
                            />
                            <NumberField
                                label="能量上限"
                                value={snapshot.energyMax}
                                min={1}
                                disabled
                            />
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            回合开始密探印记
                            <span className="ml-2 font-normal text-slate-400">
                                （由初始设置或上回合推导，不可改）
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {snapshot.startColors.map((color, i) => (
                                <ColorButton key={i} color={color} disabled />
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2 flex flex-wrap items-center gap-2">
                            <span>本回合操作要求</span>
                            <button
                                type="button"
                                onClick={onJumpToPullReq}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                                aria-label="回到下拉操作要求对应行"
                                title="回到下拉操作要求对应行"
                            >
                                <ArrowUp size={14} />
                            </button>
                            <span className="font-normal text-slate-400">
                                （↑ 回到上方「下拉操作要求」对应行）
                            </span>
                        </div>
                        <SlotConstraintsReadonly constraints={roundConstraints} />
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">可选方案</div>
                        <PlanTable
                            snapshot={snapshot}
                            getConstraints={getConstraints}
                            onApplyPlan={onApplyPlan}
                            dualSnakePersonIndex={dualSnakePersonIndex}
                        />
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            我方行动完毕后颜色状态
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {after.colors.map((color, i) => (
                                <ColorButton
                                    key={i}
                                    color={color}
                                    label={`↓×${after.pulls[i]}`}
                                    onClick={() => onPull(i)}
                                />
                            ))}
                            <button
                                type="button"
                                onClick={onUndoPull}
                                disabled={round.afterHistory.length === 0}
                                className="ml-1 inline-flex items-center gap-1 px-3 h-12 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <Undo2 size={16} />
                                撤回
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            下回合颜色状态
                            <span className="ml-2 font-normal text-slate-400">
                                （自动推导，不可改）
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {nextPreviewColors.map((color, i) => (
                                <ColorButton key={i} color={color} disabled />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Stage2RoundPanel({
    round,
    isBaseRound,
    onToggle,
    onDelete,
    onChangeStartColor,
    onChangeMeta,
    onChangePullRequirements,
    onPull,
    onUndoPull,
    onApplyPlan,
    canDelete,
    dualSnakePersonIndex,
}: {
    round: Stage2RoundData;
    isBaseRound: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onChangeStartColor: (index: number) => void;
    onChangeMeta: (
        patch: Partial<
            Pick<Stage2RoundSnapshot, 'roundNumber' | 'energy' | 'energyMax' | 'bossLayers'>
        >,
    ) => void;
    onChangePullRequirements: (next: RoundConstraints) => void;
    onPull: (index: number) => void;
    onUndoPull: () => void;
    onApplyPlan: (plan: PullPlan) => void;
    canDelete: boolean;
    dualSnakePersonIndex: DualSnakePersonIndex;
}) {
    const { snapshot, after, pullRequirements } = round;
    const startEditable = isBaseRound;

    const nextPreviewColors = useMemo(
        () =>
            deriveNextColors(
                after.colors,
                snapshot.roundNumber,
                snapshot.energy,
                snapshot.energyMax,
                snapshot.seals,
                false,
                dualSnakePersonIndex,
            ),
        [after.colors, snapshot, dualSnakePersonIndex],
    );

    const nextLayers = useMemo(
        () => deriveNextLayers(snapshot.bossLayers, nextPreviewColors),
        [snapshot.bossLayers, nextPreviewColors],
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center gap-2">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={onToggle}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                        aria-label={round.isCollapsed ? '展开' : '折叠'}
                    >
                        {round.isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <span className="font-bold text-slate-800">第 {snapshot.roundNumber} 回合</span>
                    <span className="text-xs text-slate-500 truncate">
                        能量 {snapshot.energy}/{snapshot.energyMax} · 紫眼 {snapshot.bossLayers}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onDelete}
                    disabled={!canDelete}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    aria-label="删除回合"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {!round.isCollapsed && (
                <div className="p-4 space-y-5">
                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            状态
                            {isBaseRound && (
                                <span className="ml-2 font-normal text-slate-400">
                                    （首回合可改编号 / 能量 / 上限 / 紫眼数 / 颜色）
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">封印</span>
                                <SealIcons seals={snapshot.seals} />
                            </div>
                            <NumberField
                                label="回合"
                                value={snapshot.roundNumber}
                                min={1}
                                disabled={!isBaseRound}
                                onChange={(roundNumber) => onChangeMeta({ roundNumber })}
                            />
                            <EnergyChoiceButtons
                                label="Boss 能量"
                                value={snapshot.energy}
                                options={STAGE2_ENERGY_OPTIONS}
                                disabled={!isBaseRound}
                                isOptionDisabled={(n) => n > snapshot.energyMax}
                                onChange={(energy) => onChangeMeta({ energy })}
                            />
                            <EnergyChoiceButtons
                                label="能量上限"
                                value={snapshot.energyMax}
                                options={STAGE2_ENERGY_OPTIONS}
                                disabled={!isBaseRound}
                                onChange={(energyMax) => {
                                    const next = clampStage2EnergyFields(
                                        snapshot.energy,
                                        energyMax,
                                    );
                                    onChangeMeta(next);
                                }}
                            />
                            <NumberField
                                label="Boss紫眼数"
                                value={snapshot.bossLayers}
                                min={0}
                                disabled={!isBaseRound}
                                onChange={(bossLayers) => onChangeMeta({ bossLayers })}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            回合开始密探印记
                            {!startEditable && (
                                <span className="ml-2 font-normal text-slate-400">
                                    （由上回合推导，不可改）
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {snapshot.startColors.map((color, i) => (
                                <ColorButton
                                    key={i}
                                    color={color}
                                    disabled={!startEditable}
                                    onClick={startEditable ? () => onChangeStartColor(i) : undefined}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            下拉操作要求
                        </div>
                        <SlotConstraintEditors
                            constraints={pullRequirements}
                            onChange={onChangePullRequirements}
                        />
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">可选方案</div>
                        <Stage2PlanTable
                            snapshot={snapshot}
                            constraints={pullRequirements}
                            onApplyPlan={onApplyPlan}
                            dualSnakePersonIndex={dualSnakePersonIndex}
                        />
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            我方行动完毕后颜色状态
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {after.colors.map((color, i) => (
                                <ColorButton
                                    key={i}
                                    color={color}
                                    label={`↓×${after.pulls[i]}`}
                                    onClick={() => onPull(i)}
                                />
                            ))}
                            <button
                                type="button"
                                onClick={onUndoPull}
                                disabled={round.afterHistory.length === 0}
                                className="ml-1 inline-flex items-center gap-1 px-3 h-12 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <Undo2 size={16} />
                                撤回
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-500 mb-2">
                            下回合颜色状态
                            <span className="ml-2 font-normal text-slate-400">
                                （自动推导，不可改）
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex flex-wrap gap-2">
                                {nextPreviewColors.map((color, i) => (
                                    <ColorButton key={i} color={color} disabled />
                                ))}
                            </div>
                            <div className="text-sm text-slate-600">
                                下回合紫眼{' '}
                                <span className="font-mono font-bold text-slate-800">{nextLayers}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- 主组件 ---

function isSlotConstraint(value: unknown): value is SlotConstraint {
    if (!value || typeof value !== 'object') return false;
    const v = value as SlotConstraint;
    return typeof v.min === 'number' && typeof v.max === 'number';
}

function isRoundConstraints(value: unknown, teamSize: number): value is RoundConstraints {
    return Array.isArray(value) && value.length === teamSize && value.every(isSlotConstraint);
}

function isPullReqRowArray(value: unknown): value is PullReqRow[] {
    return (
        Array.isArray(value) &&
        value.every(
            (r) =>
                r &&
                typeof r === 'object' &&
                typeof r.id === 'string' &&
                Array.isArray(r.slots) &&
                r.slots.every(isSlotConstraint),
        )
    );
}

function isRoundDataArray(value: unknown): value is RoundData[] {
    return (
        Array.isArray(value) &&
        value.every(
            (r) =>
                r &&
                typeof r === 'object' &&
                typeof r.id === 'string' &&
                r.snapshot &&
                r.after &&
                Array.isArray(r.after.colors) &&
                Array.isArray(r.after.pulls),
        )
    );
}

function isStage2RoundDataArray(value: unknown): value is Stage2RoundData[] {
    return (
        Array.isArray(value) &&
        value.every(
            (r) =>
                r &&
                typeof r === 'object' &&
                typeof r.id === 'string' &&
                r.snapshot &&
                typeof r.snapshot.bossLayers === 'number' &&
                r.after &&
                Array.isArray(r.after.colors) &&
                Array.isArray(r.after.pulls) &&
                Array.isArray(r.pullRequirements) &&
                r.pullRequirements.every(isSlotConstraint),
        )
    );
}

export default function Yuan2026L3() {
    const [teamSize, setTeamSize] = useStickyState<number>(5, STORAGE_KEY_TEAM_SIZE);
    const [dualSnake, setDualSnake] = useStickyState<DualSnakeState>(
        DEFAULT_DUAL_SNAKE,
        STORAGE_KEY_DUAL_SNAKE,
    );
    const dualSnakePersonIndex = useMemo(
        () => effectiveDualSnake(teamSize, dualSnake),
        [teamSize, dualSnake],
    );
    const [rounds, setRounds] = useStickyState<RoundData[]>(
        [createRound(createInitialSnapshot(teamSize), true)],
        STORAGE_KEY_STAGE1,
    );
    const [pullReqRows, setPullReqRows] = useStickyState<PullReqRow[]>(
        [createPullReqRow(teamSize)],
        STORAGE_KEY_PULL_REQ,
    );
    const [stage2Rounds, setStage2Rounds] = useStickyState<Stage2RoundData[]>(
        [createStage2Round(createInitialStage2Snapshot(teamSize), true)],
        STORAGE_KEY_STAGE2,
    );

    const colorRoundNumbers = useMemo(
        () => new Set(rounds.map((r) => r.snapshot.roundNumber)),
        [rounds],
    );

    const baseRoundNumber = rounds[0]?.snapshot.roundNumber ?? 1;

    const getConstraints = useMemo(() => {
        return (roundNumber: number) =>
            lookupRoundConstraints(pullReqRows, roundNumber, teamSize, baseRoundNumber);
    }, [pullReqRows, teamSize, baseRoundNumber]);

    const getDefaultPulls = useMemo(() => {
        return (roundNumber: number) =>
            pullsFromConstraints(getConstraints(roundNumber));
    }, [getConstraints]);

    const applyTeamSize = (size: number) => {
        if (size === teamSize) return;
        if (
            !window.confirm(
                `将队伍人数改为 ${size} 人？阶段一与阶段二推理器将全部重置。`,
            )
        ) {
            return;
        }
        setTeamSize(size);
        if (size >= 5) {
            setDualSnake(DEFAULT_DUAL_SNAKE);
        } else {
            setDualSnake((prev) => ({
                ...prev,
                personIndex: Math.min(prev.personIndex, size - 1),
            }));
        }
        setRounds([
            createRound(
                createInitialSnapshot(size),
                true,
                pullsFromConstraints(defaultRoundConstraints(size)),
            ),
        ]);
        setPullReqRows([createPullReqRow(size)]);
        setStage2Rounds([
            createStage2Round(createInitialStage2Snapshot(size), true),
        ]);
    };

    const applyDualSnake = (next: DualSnakeState) => {
        const clamped: DualSnakeState = {
            enabled: next.enabled && teamSize < 5,
            personIndex: Math.min(
                Math.max(0, Math.floor(next.personIndex)),
                Math.max(0, teamSize - 1),
            ),
        };
        const effective = effectiveDualSnake(teamSize, clamped);
        setDualSnake(clamped);
        setRounds((prev) => cascadeStage1Rounds(prev, 0, getDefaultPulls, effective));
        setStage2Rounds((prev) => cascadeStage2Rounds(prev, 0, effective));
    };

    const jumpToColorRound = (roundNumber: number) => {
        const target = rounds.find((r) => r.snapshot.roundNumber === roundNumber);
        if (!target) return;
        if (target.isCollapsed) {
            setRounds((prev) =>
                prev.map((r) => ({
                    ...r,
                    isCollapsed: r.id !== target.id,
                })),
            );
        }
        window.setTimeout(() => {
            document
                .getElementById(colorRoundDomId(roundNumber))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    };

    const jumpToPullReq = (roundNumber: number) => {
        const lastRound = baseRoundNumber + pullReqRows.length - 1;
        const inRange =
            roundNumber >= baseRoundNumber && roundNumber <= lastRound;
        const targetRound = inRange ? roundNumber : lastRound;
        if (!inRange) {
            window.alert(
                `下拉操作要求中尚无第 ${roundNumber} 回合，请先新增对应行。`,
            );
        }
        if (pullReqRows.length < 1) return;
        document
            .getElementById(pullReqDomId(targetRound))
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const updateRound = (id: string, updater: (r: RoundData) => RoundData) => {
        setRounds((prev) => {
            const idx = prev.findIndex((r) => r.id === id);
            if (idx < 0) return prev;
            let next = prev.map((r) => (r.id === id ? updater(r) : r));
            next = cascadeStage1Rounds(next, idx, getDefaultPulls, dualSnakePersonIndex);
            const updated = next[idx];
            if (updated && !updated.isCollapsed) {
                return collapseOthers(next, id);
            }
            return next;
        });
    };

    const updateStage2Round = (
        id: string,
        updater: (r: Stage2RoundData) => Stage2RoundData,
    ) => {
        setStage2Rounds((prev) => {
            const idx = prev.findIndex((r) => r.id === id);
            if (idx < 0) return prev;
            let next = prev.map((r) => (r.id === id ? updater(r) : r));
            next = cascadeStage2Rounds(next, idx, dualSnakePersonIndex);
            const updated = next[idx];
            if (updated && !updated.isCollapsed) {
                return collapseOthers(next, id);
            }
            return next;
        });
    };

    const toggleRound = (id: string) => {
        setRounds((prev) => {
            const target = prev.find((r) => r.id === id);
            if (!target) return prev;
            const willExpand = target.isCollapsed;
            return prev.map((r) => {
                if (r.id === id) return { ...r, isCollapsed: !willExpand };
                if (willExpand) return { ...r, isCollapsed: true };
                return r;
            });
        });
    };

    const toggleStage2Round = (id: string) => {
        setStage2Rounds((prev) => {
            const target = prev.find((r) => r.id === id);
            if (!target) return prev;
            const willExpand = target.isCollapsed;
            return prev.map((r) => {
                if (r.id === id) return { ...r, isCollapsed: !willExpand };
                if (willExpand) return { ...r, isCollapsed: true };
                return r;
            });
        });
    };

    const syncStage2FirstRound = (snapshot: RoundSnapshot) => {
        setStage2Rounds((prev) => {
            const first = prev[0];
            const bossLayers = first?.snapshot.bossLayers ?? 0;
            const pullRequirements = first?.pullRequirements;
            const energyFields = clampStage2EnergyFields(
                snapshot.energy,
                snapshot.energyMax,
            );
            return [
                createStage2Round(
                    {
                        ...toStage2Snapshot(snapshot, bossLayers),
                        ...energyFields,
                    },
                    true,
                    pullRequirements,
                ),
            ];
        });
    };

    const addRound = () => {
        const last = rounds[rounds.length - 1];
        if (!last) {
            setRounds([
                createRound(
                    createInitialSnapshot(teamSize),
                    true,
                    getDefaultPulls(1),
                ),
            ]);
            return;
        }
        const nextSnapshot = deriveNextRound(
            last.snapshot,
            last.after.colors,
            dualSnakePersonIndex,
        );

        if (!hasAnySeal(nextSnapshot.seals)) {
            if (
                !window.confirm(
                    '所有封印已解除。将把本回合状态同步到阶段二第 1 回合，并清除阶段二第 2 回合及之后的所有回合。是否继续？',
                )
            ) {
                return;
            }
            syncStage2FirstRound(nextSnapshot);
            return;
        }

        setRounds((prev) => {
            const collapsed = prev.map((r) => ({ ...r, isCollapsed: true }));
            return [
                ...collapsed,
                createRound(
                    nextSnapshot,
                    true,
                    getDefaultPulls(nextSnapshot.roundNumber),
                ),
            ];
        });
    };

    const addStage2Round = () => {
        setStage2Rounds((prev) => {
            const last = prev[prev.length - 1];
            if (!last) {
                return [
                    createStage2Round(createInitialStage2Snapshot(teamSize), true),
                ];
            }
            const nextSnapshot = deriveNextStage2Round(
                last.snapshot,
                last.after.colors,
                dualSnakePersonIndex,
            );
            const collapsed = prev.map((r) => ({ ...r, isCollapsed: true }));
            return [
                ...collapsed,
                createStage2Round(nextSnapshot, true, last.pullRequirements),
            ];
        });
    };

    const resetRounds = () => {
        if (!window.confirm('确认重置？将清空阶段一的操作要求与颜色推断，回到初始状态。')) {
            return;
        }
        setRounds([
            createRound(
                createInitialSnapshot(teamSize),
                true,
                pullsFromConstraints(defaultRoundConstraints(teamSize)),
            ),
        ]);
        setPullReqRows([createPullReqRow(teamSize)]);
    };

    const resetStage2Rounds = () => {
        if (
            !window.confirm(
                '确认重置阶段二？将清空第 2 回合及之后的所有回合，并恢复第 1 回合为初始状态。',
            )
        ) {
            return;
        }
        setStage2Rounds([
            createStage2Round(createInitialStage2Snapshot(teamSize), true),
        ]);
    };

    const deleteRound = (id: string) => {
        const idx = rounds.findIndex((r) => r.id === id);
        if (idx <= 0) return;
        if (
            !window.confirm(
                '确认删除该回合？其后所有回合也将一并删除。',
            )
        ) {
            return;
        }
        setRounds((prev) => {
            const i = prev.findIndex((r) => r.id === id);
            if (i <= 0) return prev;
            const kept = prev.slice(0, i);
            const last = kept[kept.length - 1]!;
            return kept.map((r) =>
                r.id === last.id ? { ...r, isCollapsed: false } : { ...r, isCollapsed: true },
            );
        });
    };

    const deleteStage2Round = (id: string) => {
        const idx = stage2Rounds.findIndex((r) => r.id === id);
        if (idx <= 0) return;
        if (
            !window.confirm(
                '确认删除该回合？其后所有回合也将一并删除。',
            )
        ) {
            return;
        }
        setStage2Rounds((prev) => {
            const i = prev.findIndex((r) => r.id === id);
            if (i <= 0) return prev;
            const kept = prev.slice(0, i);
            const last = kept[kept.length - 1]!;
            return kept.map((r) =>
                r.id === last.id ? { ...r, isCollapsed: false } : { ...r, isCollapsed: true },
            );
        });
    };

    const changeStartColor = (id: string, index: number) => {
        setRounds((prev) => {
            if (prev[0]?.id !== id) return prev;
            let next = prev.map((r) => {
                if (r.id !== id) return r;
                const startColors = [...r.snapshot.startColors];
                startColors[index] = advanceColor(startColors[index]!);
                return {
                    ...r,
                    snapshot: { ...r.snapshot, startColors },
                    after: freshAfter(
                        startColors,
                        getDefaultPulls(r.snapshot.roundNumber),
                    ),
                    afterHistory: [],
                    isCollapsed: false,
                };
            });
            next = cascadeStage1Rounds(next, 0, getDefaultPulls, dualSnakePersonIndex);
            return collapseOthers(next, id);
        });
    };

    const changeStage1Meta = (
        id: string,
        patch: Partial<Pick<RoundSnapshot, 'roundNumber' | 'energy' | 'energyMax'>>,
    ) => {
        setRounds((prev) => {
            if (prev[0]?.id !== id) return prev;
            let next = prev.map((r) => {
                if (r.id !== id) return r;
                const merged = { ...r.snapshot, ...patch };
                const energyFields = clampStage1EnergyFields(
                    merged.energy,
                    merged.energyMax,
                );
                const snapshot = { ...merged, ...energyFields };
                return {
                    ...r,
                    snapshot,
                    after: freshAfter(
                        snapshot.startColors,
                        getDefaultPulls(snapshot.roundNumber),
                    ),
                    afterHistory: [],
                    isCollapsed: false,
                };
            });
            next = cascadeStage1Rounds(next, 0, getDefaultPulls, dualSnakePersonIndex);
            return collapseOthers(next, id);
        });
    };

    const toggleStage1Seal = (id: string, color: SealColor) => {
        setRounds((prev) => {
            if (prev[0]?.id !== id) return prev;
            let next = prev.map((r) => {
                if (r.id !== id) return r;
                const seals = { ...r.snapshot.seals, [color]: !r.snapshot.seals[color] };
                const snapshot = { ...r.snapshot, seals };
                return {
                    ...r,
                    snapshot,
                    after: freshAfter(
                        snapshot.startColors,
                        getDefaultPulls(snapshot.roundNumber),
                    ),
                    afterHistory: [],
                    isCollapsed: false,
                };
            });
            next = cascadeStage1Rounds(next, 0, getDefaultPulls, dualSnakePersonIndex);
            return collapseOthers(next, id);
        });
    };

    const changeStage2StartColor = (id: string, index: number) => {
        setStage2Rounds((prev) => {
            if (prev[0]?.id !== id) return prev;
            let next = prev.map((r) => {
                if (r.id !== id) return r;
                const startColors = [...r.snapshot.startColors];
                startColors[index] = advanceColor(startColors[index]!);
                return {
                    ...r,
                    snapshot: { ...r.snapshot, startColors },
                    after: freshAfter(startColors),
                    afterHistory: [],
                    isCollapsed: false,
                };
            });
            next = cascadeStage2Rounds(next, 0, dualSnakePersonIndex);
            return collapseOthers(next, id);
        });
    };

    const changeStage2Meta = (
        id: string,
        patch: Partial<
            Pick<Stage2RoundSnapshot, 'roundNumber' | 'energy' | 'energyMax' | 'bossLayers'>
        >,
    ) => {
        setStage2Rounds((prev) => {
            if (prev[0]?.id !== id) return prev;
            let next = prev.map((r) => {
                if (r.id !== id) return r;
                const merged = { ...r.snapshot, ...patch };
                const energyFields = clampStage2EnergyFields(
                    merged.energy,
                    merged.energyMax,
                );
                return {
                    ...r,
                    snapshot: { ...merged, ...energyFields },
                    isCollapsed: false,
                };
            });
            next = cascadeStage2Rounds(next, 0, dualSnakePersonIndex);
            return collapseOthers(next, id);
        });
    };

    const pullSlot = (id: string, index: number) => {
        updateRound(id, (r) => {
            const history = [
                ...r.afterHistory,
                {
                    colors: [...r.after.colors],
                    pulls: [...r.after.pulls],
                },
            ];
            const pulls = [...r.after.pulls];
            pulls[index] = (pulls[index] ?? 0) + 1;
            const colors = applyPulls(r.snapshot.startColors, pulls);
            return {
                ...r,
                after: { colors, pulls },
                afterHistory: history,
            };
        });
    };

    const pullStage2Slot = (id: string, index: number) => {
        updateStage2Round(id, (r) => {
            const history = [
                ...r.afterHistory,
                {
                    colors: [...r.after.colors],
                    pulls: [...r.after.pulls],
                },
            ];
            const pulls = [...r.after.pulls];
            pulls[index] = (pulls[index] ?? 0) + 1;
            const colors = applyPulls(r.snapshot.startColors, pulls);
            return {
                ...r,
                after: { colors, pulls },
                afterHistory: history,
            };
        });
    };

    const applyStage1Plan = (id: string, plan: PullPlan) => {
        updateRound(id, (r) => {
            const history = [
                ...r.afterHistory,
                {
                    colors: [...r.after.colors],
                    pulls: [...r.after.pulls],
                },
            ];
            const pulls = [...plan];
            const colors = applyPulls(r.snapshot.startColors, pulls);
            return {
                ...r,
                after: { colors, pulls },
                afterHistory: history,
            };
        });
    };

    const applyStage2Plan = (id: string, plan: PullPlan) => {
        updateStage2Round(id, (r) => {
            const history = [
                ...r.afterHistory,
                {
                    colors: [...r.after.colors],
                    pulls: [...r.after.pulls],
                },
            ];
            const pulls = [...plan];
            const colors = applyPulls(r.snapshot.startColors, pulls);
            return {
                ...r,
                after: { colors, pulls },
                afterHistory: history,
            };
        });
    };

    const undoPull = (id: string) => {
        updateRound(id, (r) => {
            if (r.afterHistory.length === 0) return r;
            const history = [...r.afterHistory];
            const prev = history.pop()!;
            return {
                ...r,
                after: { colors: [...prev.colors], pulls: [...prev.pulls] },
                afterHistory: history,
            };
        });
    };

    const undoStage2Pull = (id: string) => {
        updateStage2Round(id, (r) => {
            if (r.afterHistory.length === 0) return r;
            const history = [...r.afterHistory];
            const prev = history.pop()!;
            return {
                ...r,
                after: { colors: [...prev.colors], pulls: [...prev.pulls] },
                afterHistory: history,
            };
        });
    };

    const handleExport = () => {
        const data = {
            teamSize,
            dualSnake,
            pullReqRows,
            rounds,
            stage2Rounds,
            version: EXPORT_VERSION,
            timestamp: new Date().toISOString(),
        };
        return {
            data: JSON.stringify(data, null, 2),
            filename: `yuan2026-l3-${new Date().toISOString().slice(0, 10)}.json`,
        };
    };

    const handleImport = (jsonContent: string) => {
        try {
            const json = JSON.parse(jsonContent) as {
                teamSize?: unknown;
                dualSnake?: unknown;
                pullReqRows?: unknown;
                rounds?: unknown;
                stage2Rounds?: unknown;
            };
            if (!isRoundDataArray(json.rounds)) {
                alert('文件格式不正确，缺少有效的阶段一数据。');
                return;
            }
            if (json.stage2Rounds != null && !isStage2RoundDataArray(json.stage2Rounds)) {
                alert('文件格式不正确，阶段二数据无效。');
                return;
            }
            if (!window.confirm('导入将覆盖当前所有数据，确定继续吗？')) return;
            const importedSize =
                typeof json.teamSize === 'number' &&
                TEAM_SIZE_OPTIONS.includes(json.teamSize as (typeof TEAM_SIZE_OPTIONS)[number])
                    ? json.teamSize
                    : (json.rounds[0]?.snapshot.startColors.length ?? teamSize);
            const size = Math.min(5, Math.max(1, Math.floor(importedSize)));
            setTeamSize(size);

            const importedDual =
                json.dualSnake != null &&
                typeof json.dualSnake === 'object' &&
                json.dualSnake !== null &&
                'enabled' in json.dualSnake &&
                'personIndex' in json.dualSnake &&
                typeof (json.dualSnake as DualSnakeState).enabled === 'boolean' &&
                typeof (json.dualSnake as DualSnakeState).personIndex === 'number'
                    ? {
                          enabled:
                              size < 5 && (json.dualSnake as DualSnakeState).enabled,
                          personIndex: Math.min(
                              Math.max(
                                  0,
                                  Math.floor(
                                      (json.dualSnake as DualSnakeState).personIndex,
                                  ),
                              ),
                              Math.max(0, size - 1),
                          ),
                      }
                    : DEFAULT_DUAL_SNAKE;
            setDualSnake(importedDual);

            const normalizedRounds =
                json.rounds.length > 0
                    ? json.rounds.map((r, index) => {
                          const startColors = resizeColors(r.snapshot.startColors, size);
                          return {
                              ...r,
                              snapshot: { ...r.snapshot, startColors },
                              after: {
                                  colors: resizeColors(r.after.colors, size),
                                  pulls: resizeColors(r.after.colors, size).map(
                                      (_, i) => r.after.pulls[i] ?? 0,
                                  ),
                              },
                              isCollapsed: index !== 0 && r.isCollapsed,
                          };
                      })
                    : [createRound(createInitialSnapshot(size), true)];
            setRounds(normalizedRounds);

            if (isPullReqRowArray(json.pullReqRows) && json.pullReqRows.length > 0) {
                setPullReqRows(
                    json.pullReqRows.map((r) => ({
                        ...r,
                        slots: resizeRoundConstraints(r.slots, size),
                    })),
                );
            } else {
                setPullReqRows([createPullReqRow(size)]);
            }

            setStage2Rounds(
                isStage2RoundDataArray(json.stage2Rounds) && json.stage2Rounds.length > 0
                    ? json.stage2Rounds.map((r, index) => {
                          const startColors = resizeColors(r.snapshot.startColors, size);
                          const energyFields = clampStage2EnergyFields(
                              r.snapshot.energy,
                              r.snapshot.energyMax,
                          );
                          return {
                              ...r,
                              snapshot: {
                                  ...r.snapshot,
                                  startColors,
                                  ...energyFields,
                              },
                              after: {
                                  colors: resizeColors(r.after.colors, size),
                                  pulls: resizeColors(r.after.colors, size).map(
                                      (_, i) => r.after.pulls[i] ?? 0,
                                  ),
                              },
                              pullRequirements: isRoundConstraints(
                                  r.pullRequirements,
                                  r.pullRequirements.length,
                              )
                                  ? resizeRoundConstraints(r.pullRequirements, size)
                                  : defaultRoundConstraints(size),
                              isCollapsed: index !== 0 && r.isCollapsed,
                          };
                      })
                    : [createStage2Round(createInitialStage2Snapshot(size), true)],
            );
            alert('导入成功！');
        } catch {
            alert('无法解析数据，请确保内容是有效的 JSON 格式。');
        }
    };

    useLevelToolbar({ onExport: handleExport, onImport: handleImport });

    const baseRound = rounds[0];

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* 第一步：队伍人数 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-3">
                        第一步：配置队伍人数
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {TEAM_SIZE_OPTIONS.map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => applyTeamSize(n)}
                                className={`w-10 h-10 rounded-lg border-2 text-sm font-bold transition-colors ${
                                    teamSize === n
                                        ? 'bg-slate-800 text-white border-slate-800'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                                aria-pressed={teamSize === n}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    {teamSize < 5 && (
                        <div className="mt-4 space-y-3">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={dualSnake.enabled}
                                    onChange={(e) =>
                                        applyDualSnake({
                                            enabled: e.target.checked,
                                            personIndex: dualSnake.personIndex,
                                        })
                                    }
                                    className="rounded border-slate-300"
                                />
                                是否有双蛇
                            </label>
                            {dualSnake.enabled && (
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold text-slate-500">
                                        双蛇位置
                                    </div>
                                    <DualSnakePositionPicker
                                        teamSize={teamSize}
                                        value={Math.min(
                                            dualSnake.personIndex,
                                            teamSize - 1,
                                        )}
                                        onChange={(personIndex) =>
                                            applyDualSnake({
                                                enabled: true,
                                                personIndex,
                                            })
                                        }
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 第二步：说明 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800">
                        第二步（可跳过）：阶段一压血 / 进行准备操作
                    </h3>
                </div>
                <div className="px-6 py-5 space-y-4 text-sm text-slate-700 leading-relaxed">
                    <p>
                        在阶段一（<Hl>boss 身上还有剑</Hl>
                        ）时，正常打 boss。
                    </p>
                    <p>
                        可以利用初始的几个回合做一些准备工作（比如：叠
                        dot，程普叠武器等）。
                    </p>
                    <p>
                        如果目标是压血，必须压到 <Hl>50% 以下</Hl>，否则进阶段二会把压掉的血补回来。<br/>
                        （即：阶段一转阶段二的时候，boss血量&lt;50%）
                    </p>
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="font-semibold text-slate-800">必须保证：</p>
                        <ul className="list-disc pl-5 space-y-1.5">
                            <li>
                                boss <Hl>不满能量</Hl>时，我方第一个行动的只能{' '}
                                <Hl>↑ / ↓</Hl>；
                            </li>
                            <li>
                                boss <Hl>满能量</Hl>时，我方第一个行动的只能{' '}
                                <Hl>A / ↓</Hl>。
                            </li>
                        </ul>
                        <p>
                            另外要记住：每个回合，boss 受到的 <Hl>第一种伤害在整个回合都为 0</Hl>
                            （除非用 <Hl>戏学逃课</Hl>）。
                        </p>
                    </div>
                </div>
            </div>

            {/* 第三步：阶段一推理器 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-gray-800">
                        第三步：消除三把剑→进阶段二
                    </h3>
                    <button
                        type="button"
                        onClick={resetRounds}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
                    >
                        <RotateCcw size={16} />
                        重置
                    </button>
                </div>
                <div className="p-4 sm:p-6 space-y-8">
                    <section>
                        <h4 className="text-base font-bold text-slate-800 mb-3">
                            初始状态设置
                        </h4>
                        {baseRound && (
                            <Stage1InitialSetup
                                snapshot={baseRound.snapshot}
                                onChangeMeta={(patch) =>
                                    changeStage1Meta(baseRound.id, patch)
                                }
                                onToggleSeal={(color) =>
                                    toggleStage1Seal(baseRound.id, color)
                                }
                                onChangeStartColor={(i) =>
                                    changeStartColor(baseRound.id, i)
                                }
                            />
                        )}
                    </section>

                    <section>
                        <h4 className="text-base font-bold text-slate-800 mb-3">
                            下拉操作要求
                        </h4>
                        <PullRequirementsSection
                            teamSize={teamSize}
                            rows={pullReqRows}
                            baseRoundNumber={baseRoundNumber}
                            colorRoundNumbers={colorRoundNumbers}
                            onChangeRows={setPullReqRows}
                            onJumpToColor={jumpToColorRound}
                        />
                    </section>

                    <section>
                        <h4 className="text-base font-bold text-slate-800 mb-3">
                            颜色变化推断
                        </h4>
                        {rounds.map((round, index) => (
                            <RoundPanel
                                key={round.id}
                                round={round}
                                canDelete={index > 0}
                                roundConstraints={getConstraints(
                                    round.snapshot.roundNumber,
                                )}
                                getConstraints={getConstraints}
                                dualSnakePersonIndex={dualSnakePersonIndex}
                                onToggle={() => toggleRound(round.id)}
                                onDelete={() => deleteRound(round.id)}
                                onPull={(i) => pullSlot(round.id, i)}
                                onUndoPull={() => undoPull(round.id)}
                                onApplyPlan={(plan) =>
                                    applyStage1Plan(round.id, plan)
                                }
                                onJumpToPullReq={() =>
                                    jumpToPullReq(round.snapshot.roundNumber)
                                }
                            />
                        ))}
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={addRound}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
                            >
                                <Plus size={16} />
                                新建回合
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            {/* 过渡说明 */}
            <p className="text-center text-sm text-slate-600 py-1">
                消除三把剑后，自动进入阶段二↓
            </p>

            {/* 第四步：阶段二推理器 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-gray-800">
                        第四步：在阶段二打死boss
                    </h3>
                    <button
                        type="button"
                        onClick={resetStage2Rounds}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
                    >
                        <RotateCcw size={16} />
                        重置
                    </button>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                    <p className="text-sm text-slate-700 leading-relaxed">
                        在阶段二里，
                        <Hl>回合结束</Hl>
                        时，boss 的紫眼数
                        <Hl>不能</Hl>
                        是
                        <Hl>2</Hl>
                        或
                        <Hl>3</Hl>
                        的倍数。
                    </p>
                    {stage2Rounds.map((round, index) => (
                        <Stage2RoundPanel
                            key={round.id}
                            round={round}
                            isBaseRound={index === 0}
                            canDelete={index > 0}
                            dualSnakePersonIndex={dualSnakePersonIndex}
                            onToggle={() => toggleStage2Round(round.id)}
                            onDelete={() => deleteStage2Round(round.id)}
                            onChangeStartColor={(i) =>
                                changeStage2StartColor(round.id, i)
                            }
                            onChangeMeta={(patch) => changeStage2Meta(round.id, patch)}
                            onChangePullRequirements={(next) =>
                                updateStage2Round(round.id, (r) => ({
                                    ...r,
                                    pullRequirements: next,
                                }))
                            }
                            onPull={(i) => pullStage2Slot(round.id, i)}
                            onUndoPull={() => undoStage2Pull(round.id)}
                            onApplyPlan={(plan) => applyStage2Plan(round.id, plan)}
                        />
                    ))}
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={addStage2Round}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
                        >
                            <Plus size={16} />
                            新建回合
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** 阶段一：颜色 / 封印 / 下回合推导 / 解除方案 */

export type SealColor = 'red' | 'blue' | 'green';

export const SEAL_COLORS: SealColor[] = ['red', 'blue', 'green'];

export const COLOR_LABEL: Record<SealColor, string> = {
    red: '红',
    blue: '蓝',
    green: '绿',
};

export const TARGET_LABEL: Record<SealColor, string> = {
    red: '解除红剑',
    blue: '解除蓝剑',
    green: '解除绿剑',
};

export interface Seals {
    red: boolean;
    blue: boolean;
    green: boolean;
}

export interface RoundSnapshot {
    roundNumber: number;
    seals: Seals;
    energy: number;
    energyMax: number;
    startColors: SealColor[];
}

/** 每位下拉次数；长度 = 队伍人数 */
export type PullPlan = number[];

/** 单位置下拉约束：[min, max] 范围（含端点） */
export type SlotConstraint = { min: number; max: number };

/** 一整回合各号位约束；长度 = 队伍人数 */
export type RoundConstraints = SlotConstraint[];

const CYCLE: SealColor[] = ['red', 'blue', 'green'];
const MAX_PULL_OPTION = 20;

export function defaultSlotConstraint(): SlotConstraint {
    return { min: 0, max: 1 };
}

export function defaultRoundConstraints(teamSize: number): RoundConstraints {
    return Array.from({ length: teamSize }, () => defaultSlotConstraint());
}

export function cloneRoundConstraints(constraints: RoundConstraints): RoundConstraints {
    return constraints.map((c) => ({ min: c.min, max: c.max }));
}

export function resizeRoundConstraints(
    constraints: RoundConstraints,
    teamSize: number,
): RoundConstraints {
    const size = Math.min(5, Math.max(1, Math.floor(teamSize)));
    if (constraints.length === size) return cloneRoundConstraints(constraints);
    if (constraints.length > size) {
        return cloneRoundConstraints(constraints.slice(0, size));
    }
    return [
        ...cloneRoundConstraints(constraints),
        ...defaultRoundConstraints(size - constraints.length),
    ];
}

export function formatSlotConstraint(c: SlotConstraint): string {
    return `${c.min}~${c.max}`;
}

export function advanceColor(color: SealColor, steps = 1): SealColor {
    const idx = CYCLE.indexOf(color);
    return CYCLE[(idx + steps) % CYCLE.length]!;
}

export function applyPulls(colors: SealColor[], pulls: number[]): SealColor[] {
    return colors.map((c, i) => advanceColor(c, pulls[i] ?? 0));
}

function swapIfExists<T>(arr: T[], a: number, b: number): void {
    if (a >= arr.length || b >= arr.length) return;
    const t = arr[a]!;
    arr[a] = arr[b]!;
    arr[b] = t;
}

/** 2.5.2：从行动后颜色推导下回合颜色（不修改封印 / 能量） */
export function deriveNextColors(
    afterColors: SealColor[],
    roundNumber: number,
    energy: number,
    energyMax: number,
    seals: Seals,
    isStage1: boolean,
): SealColor[] {
    const colors = afterColors.map((c) => advanceColor(c, 1));
    const n = colors.length;

    if (energy < energyMax) {
        if (roundNumber % 2 === 0) {
            for (const i of [0, 2, 4]) {
                if (i < n) colors[i] = advanceColor(colors[i]!);
            }
        }
        if (roundNumber % 3 === 0) {
            for (const i of [1, 3]) {
                if (i < n) colors[i] = advanceColor(colors[i]!);
            }
        }
        if (isStage1) {
            if (!seals.red) swapIfExists(colors, 1, 2);
            if (!seals.blue) swapIfExists(colors, 2, 3);
            if (!seals.green) {
                swapIfExists(colors, 0, 1);
                swapIfExists(colors, 3, 4);
            }
        }
    }

    return colors;
}

export function allSameColor(colors: SealColor[]): SealColor | null {
    if (colors.length === 0) return null;
    const first = colors[0]!;
    return colors.every((c) => c === first) ? first : null;
}

/** 2.5：由当前回合行动结果推导下一回合初始状态 */
export function deriveNextRound(
    snapshot: RoundSnapshot,
    afterColors: SealColor[],
): RoundSnapshot {
    const nextColors = deriveNextColors(
        afterColors,
        snapshot.roundNumber,
        snapshot.energy,
        snapshot.energyMax,
        snapshot.seals,
        true,
    );
    const energy = snapshot.energy >= snapshot.energyMax ? 0 : snapshot.energy;

    const seals: Seals = { ...snapshot.seals };
    let energyMax = snapshot.energyMax;
    const uniform = allSameColor(nextColors);
    if (uniform === 'red') {
        seals.red = false;
    } else if (uniform === 'blue') {
        seals.blue = false;
    } else if (uniform === 'green') {
        seals.green = false;
        energyMax = Math.max(1, energyMax - 1);
    }

    return {
        roundNumber: snapshot.roundNumber + 1,
        seals,
        energy: Math.min(energyMax, energy + 1),
        energyMax,
        startColors: nextColors,
    };
}

function snapshotKey(snapshot: RoundSnapshot): string {
    const { seals, startColors } = snapshot;
    return [
        snapshot.roundNumber,
        snapshot.energy,
        snapshot.energyMax,
        seals.red ? 1 : 0,
        seals.blue ? 1 : 0,
        seals.green ? 1 : 0,
        startColors.join(','),
    ].join('|');
}

function optionsForSlot(constraint: SlotConstraint): number[] {
    const min = Math.max(0, Math.floor(constraint.min));
    const max = Math.min(
        MAX_PULL_OPTION,
        Math.max(min, Math.floor(constraint.max)),
    );
    const opts: number[] = [];
    for (let i = min; i <= max; i++) opts.push(i);
    return opts.length > 0 ? opts : [0];
}

/** 枚举满足整回合约束的下拉方案 */
export function enumerateConstrainedPulls(
    constraints: RoundConstraints,
): PullPlan[] {
    const n = constraints.length;
    if (n === 0) return [[]];

    const options = constraints.map(optionsForSlot);
    const plans: PullPlan[] = [];
    const current: number[] = new Array(n).fill(0);

    const dfs = (i: number) => {
        if (i === n) {
            plans.push([...current]);
            return;
        }
        for (const v of options[i]!) {
            current[i] = v;
            dfs(i + 1);
        }
    };
    dfs(0);
    return plans;
}

export function hasAnySeal(seals: Seals): boolean {
    return seals.red || seals.blue || seals.green;
}

export interface ShortestElimination {
    /** 最短路径第一回合的下拉 */
    firstPulls: PullPlan;
    /** 路径长度（回合数） */
    pathLength: number;
}

const MAX_ELIMINATION_DEPTH = 24;

/**
 * BFS 找解除目标剑的最短路径。
 * getConstraints(roundNumber) 返回该绝对回合的下拉约束；
 * 未指定的回合应由调用方返回默认范围 0–1。
 */
export function findShortestElimination(
    snapshot: RoundSnapshot,
    target: SealColor,
    getConstraints: (roundNumber: number) => RoundConstraints,
): ShortestElimination | null {
    if (!snapshot.seals[target]) return null;

    type Node = {
        snapshot: RoundSnapshot;
        depth: number;
        firstPulls: PullPlan | null;
    };

    const queue: Node[] = [{ snapshot, depth: 0, firstPulls: null }];
    const visited = new Set<string>([snapshotKey(snapshot)]);

    while (queue.length > 0) {
        const node = queue.shift()!;
        if (node.depth >= MAX_ELIMINATION_DEPTH) continue;

        const pullOptions = enumerateConstrainedPulls(
            getConstraints(node.snapshot.roundNumber),
        );

        for (const pulls of pullOptions) {
            const after = applyPulls(node.snapshot.startColors, pulls);
            const next = deriveNextRound(node.snapshot, after);
            const firstPulls = node.firstPulls ?? pulls;
            const pathLength = node.depth + 1;

            if (node.snapshot.seals[target] && !next.seals[target]) {
                return { firstPulls, pathLength };
            }

            const key = snapshotKey(next);
            if (visited.has(key)) continue;
            visited.add(key);
            queue.push({ snapshot: next, depth: pathLength, firstPulls });
        }
    }

    return null;
}

export function createInitialSnapshot(teamSize = 5): RoundSnapshot {
    const size = Math.min(5, Math.max(1, Math.floor(teamSize)));
    return {
        roundNumber: 1,
        seals: { red: true, blue: true, green: true },
        energy: 1,
        energyMax: 5,
        startColors: Array.from({ length: size }, () => 'red' as SealColor),
    };
}

export function resizeColors(colors: SealColor[], teamSize: number): SealColor[] {
    const size = Math.min(5, Math.max(1, Math.floor(teamSize)));
    if (colors.length === size) return colors;
    if (colors.length > size) return colors.slice(0, size);
    return [
        ...colors,
        ...Array.from({ length: size - colors.length }, () => 'red' as SealColor),
    ];
}

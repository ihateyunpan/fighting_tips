/** 阶段二：层数 / 避免退场方案 */

import {
    allSameColor,
    applyPulls,
    deriveNextColors,
    enumerateConstrainedPulls,
    type DualSnakePersonIndex,
    type RoundConstraints,
    type PullPlan,
    type RoundSnapshot,
    type SealColor,
    type Seals,
} from './stage1Logic';

export interface Stage2RoundSnapshot {
    roundNumber: number;
    seals: Seals;
    energy: number;
    energyMax: number;
    startColors: SealColor[];
    /** Boss 层数 */
    bossLayers: number;
}

export function toStage2Snapshot(
    snapshot: RoundSnapshot,
    bossLayers = 0,
): Stage2RoundSnapshot {
    return {
        roundNumber: snapshot.roundNumber,
        seals: { ...snapshot.seals },
        energy: snapshot.energy,
        energyMax: snapshot.energyMax,
        startColors: [...snapshot.startColors],
        bossLayers,
    };
}

/** 阶段二默认首回合（可手填编号 / 能量 / 上限 / 颜色 / 紫眼） */
export function createInitialStage2Snapshot(teamSize = 5): Stage2RoundSnapshot {
    const size = Math.min(5, Math.max(1, Math.floor(teamSize)));
    return {
        roundNumber: 1,
        seals: { red: false, blue: false, green: false },
        energy: 1,
        energyMax: 4,
        startColors: Array.from({ length: size }, () => 'red' as SealColor),
        bossLayers: 0,
    };
}

export function deriveNextLayers(
    currentLayers: number,
    nextColors: SealColor[],
): number {
    let delta = 0;
    for (const c of nextColors) {
        if (c === 'red') delta += 1;
        else if (c === 'blue') delta += 2;
        else delta += 3;
    }
    return currentLayers + delta;
}

/** 层数不是 2 的倍数，也不是 3 的倍数 */
export function isSafeLayers(layers: number): boolean {
    return layers % 2 !== 0 && layers % 3 !== 0;
}

/**
 * 枚举使下回合层数安全（非 2/3 倍数）的方案，受 constraints 限制。
 * 排除下回合全同色。按总下拉次数升序、字典序排列。
 */
export function findAvoidExitPlans(
    snapshot: Stage2RoundSnapshot,
    constraints: RoundConstraints,
    dualSnakePersonIndex: DualSnakePersonIndex = null,
): PullPlan[] {
    const teamSize = snapshot.startColors.length;
    if (constraints.length !== teamSize) return [];

    const plans: { pulls: PullPlan; total: number; key: string }[] = [];

    for (const pulls of enumerateConstrainedPulls(constraints)) {
        const after = applyPulls(snapshot.startColors, pulls);
        const nextColors = deriveNextColors(
            after,
            snapshot.roundNumber,
            snapshot.energy,
            snapshot.energyMax,
            snapshot.seals,
            false,
            dualSnakePersonIndex,
        );
        if (allSameColor(nextColors) != null) continue;
        const nextLayers = deriveNextLayers(snapshot.bossLayers, nextColors);
        if (!isSafeLayers(nextLayers)) continue;
        const total = pulls.reduce((s, n) => s + n, 0);
        plans.push({ pulls, total, key: pulls.join(',') });
    }

    plans.sort(
        (a, b) => a.total - b.total || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
    return plans.map((p) => p.pulls);
}

/** 由当前回合行动结果推导下一回合（阶段二） */
export function deriveNextStage2Round(
    snapshot: Stage2RoundSnapshot,
    afterColors: SealColor[],
    dualSnakePersonIndex: DualSnakePersonIndex = null,
): Stage2RoundSnapshot {
    const nextColors = deriveNextColors(
        afterColors,
        snapshot.roundNumber,
        snapshot.energy,
        snapshot.energyMax,
        snapshot.seals,
        false,
        dualSnakePersonIndex,
    );
    const energy = snapshot.energy >= snapshot.energyMax ? 0 : snapshot.energy;

    return {
        roundNumber: snapshot.roundNumber + 1,
        seals: { ...snapshot.seals },
        energy: Math.min(snapshot.energyMax, energy + 1),
        energyMax: snapshot.energyMax,
        startColors: nextColors,
        bossLayers: deriveNextLayers(snapshot.bossLayers, nextColors),
    };
}

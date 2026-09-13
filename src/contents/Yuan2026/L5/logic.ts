/** 袁术归来兮4：红圈密探推导 */

export const ENERGY_MAX = 4;

export const RED_RING_POSITIONS = ['1/2号位', '4/5号位', '3号位'] as const;

export type RedRingPosition = (typeof RED_RING_POSITIONS)[number];

export interface RoundState {
    round: number;
    energy: number;
    energyMax: number;
    killed: boolean;
    redRing: RedRingPosition;
}

export function formatEnergy(energy: number, energyMax: number): string {
    return `${energy}/${energyMax}`;
}

export function isFullEnergy(energy: number, energyMax: number): boolean {
    return energy === energyMax;
}

function ringIndex(pos: RedRingPosition): number {
    return RED_RING_POSITIONS.indexOf(pos);
}

/** 环上右移 n 位：1/2 → 4/5 → 3 → 1/2 */
export function shiftRedRing(pos: RedRingPosition, steps: number): RedRingPosition {
    const len = RED_RING_POSITIONS.length;
    const next = (((ringIndex(pos) + steps) % len) + len) % len;
    return RED_RING_POSITIONS[next];
}

/** 由上回合能量推导本回合开始时能量 */
export function deriveNextEnergy(
    prevEnergy: number,
    prevEnergyMax: number,
): { energy: number; energyMax: number } {
    let energy = prevEnergy;
    const energyMax = prevEnergyMax;
    if (isFullEnergy(energy, energyMax)) {
        energy = 0;
    }
    energy = Math.min(energy + 2, energyMax);
    return { energy, energyMax };
}

/**
 * 红圈密探：
 * - 第 1 回合：未击杀 → 1/2号位；击杀 → 3号位
 * - 之后按环与击杀/满能量规则推导
 */
export function deriveRedRing(
    round: number,
    killed: boolean,
    energy: number,
    energyMax: number,
    prev: RoundState | null,
): RedRingPosition {
    if (round === 1 || !prev) {
        return killed ? '3号位' : '1/2号位';
    }

    const prevFull = isFullEnergy(prev.energy, prev.energyMax);
    const currFull = isFullEnergy(energy, energyMax);
    const noKillAndNotFull = !killed && !currFull;

    if (prev.killed && prevFull) {
        return noKillAndNotFull ? prev.redRing : shiftRedRing(prev.redRing, 2);
    }
    return noKillAndNotFull ? shiftRedRing(prev.redRing, 1) : prev.redRing;
}

export function createInitialRound(): RoundState {
    const energy = 1;
    const energyMax = ENERGY_MAX;
    const killed = false;
    return {
        round: 1,
        energy,
        energyMax,
        killed,
        redRing: deriveRedRing(1, killed, energy, energyMax, null),
    };
}

/** 在已锁定的前序回合后追加一行（默认不击杀） */
export function appendRound(prevRounds: RoundState[]): RoundState {
    const prev = prevRounds[prevRounds.length - 1];
    const { energy, energyMax } = deriveNextEnergy(prev.energy, prev.energyMax);
    const killed = false;
    const round = prev.round + 1;
    return {
        round,
        energy,
        energyMax,
        killed,
        redRing: deriveRedRing(round, killed, energy, energyMax, prev),
    };
}

/** 更新某一行的击杀状态，并重算该行及之后所有行的红圈（能量不变） */
export function withKilledAt(rounds: RoundState[], index: number, killed: boolean): RoundState[] {
    if (index < 0 || index >= rounds.length) return rounds;
    const next = rounds.map((r) => ({ ...r }));
    next[index] = { ...next[index], killed };
    for (let i = index; i < next.length; i++) {
        const prev = i === 0 ? null : next[i - 1];
        const cur = next[i];
        next[i] = {
            ...cur,
            redRing: deriveRedRing(cur.round, cur.killed, cur.energy, cur.energyMax, prev),
        };
    }
    return next;
}

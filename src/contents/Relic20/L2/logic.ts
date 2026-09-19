/** 孙静 · 遗迹2：按击杀方案推剑、书 */

import { OPEN_PLANS } from './plans';

export const ENERGY_MAX = 3;
export const BOOK_MAX = 5;
export const SWORD_MAX = 4;
export const MOB_COUNT = 4;
export const ROUND_COUNT = 4;

export const TARGET_ROUNDS = [4, 8, 12, 16] as const;
export type TargetRound = (typeof TARGET_ROUNDS)[number];

/** 击杀个数的尝试顺序。0 没点名，放在最后。 */
export const KILL_COUNT_ORDER = [4, 1, 2, 3, 0] as const;
/** 同一击杀个数下，优先纳入的小怪。 */
const MOB_PRIORITY = [4, 1, 2, 3] as const;

export type Energy = [number, number, number, number];

export interface PlanInput {
    energy: Energy;
    /** 起始目标回合，须 ≤ targetEnd */
    targetStart: TargetRound;
    /** 终止目标回合，须 ≥ targetStart */
    targetEnd: TargetRound;
    /** allowedCounts[回合下标][个数] */
    allowedCounts: readonly (readonly boolean[])[];
}

/** 从起始到终止（含）共多少个四回合周期。 */
export function cycleCount(start: TargetRound, end: TargetRound): number {
    return (end - start) / 4 + 1;
}

export interface MobAction {
    mob: number;
    times: number;
}

export interface RoundTrace {
    round: number;
    /** 回合开始时 1–4 号能量 */
    startEnergy: Energy;
    /** 本回合结算后的能量，即下回合开始时的分布 */
    nextEnergy: Energy;
    /** 1-based，升序，仅用于展示 */
    killed: number[];
    actions: MobAction[];
    sword: number;
    book: number;
    /** 孙静不满能量且剑 > 0，结算时书实际加了 1 */
    bookFromSword: boolean;
}

interface SimState {
    energy: Energy;
    sword: number;
    book: number;
}

function cloneEnergy(energy: Energy): Energy {
    return [energy[0], energy[1], energy[2], energy[3]];
}

function cloneState(state: SimState): SimState {
    return {
        energy: cloneEnergy(state.energy),
        sword: state.sword,
        book: state.book,
    };
}

function applyAction(state: SimState, mob: number) {
    if (mob === 2 || mob === 4) {
        state.book = Math.min(BOOK_MAX, state.book + 1);
        return;
    }
    if (state.book >= 2) {
        state.book = 0;
        state.sword = Math.min(SWORD_MAX, state.sword + 1);
    }
}

interface SettledRound {
    state: SimState;
    startEnergy: Energy;
    killed: number[];
    actions: MobAction[];
    bookFromSword: boolean;
}

/**
 * ②④ 水：行动后书 +1。①③ 火：书 ≥ 2 则书清零、剑 +1。
 * 被击杀者不行动，能量停在回合开始时；未击杀者行动后能量 +1（满能量先行动 2 次并清零）。
 * 孙静不满能量且结算后剑 > 0 时，书再 +1。
 */
function settleRound(state: SimState, killed: readonly number[], fullEnergy: boolean): SettledRound {
    const next = cloneState(state);
    const startEnergy = cloneEnergy(next.energy);
    const killedSet = new Set(killed);
    const actions: MobAction[] = [];

    for (let mob = 1; mob <= MOB_COUNT; mob++) {
        if (killedSet.has(mob)) continue;
        const index = mob - 1;
        const full = next.energy[index] >= ENERGY_MAX;
        const times = full ? 2 : 1;
        for (let t = 0; t < times; t++) applyAction(next, mob);
        if (full) next.energy[index] = 0;
        actions.push({ mob, times });
    }

    let bookFromSword = false;
    if (!fullEnergy && next.sword > 0) {
        const before = next.book;
        next.book = Math.min(BOOK_MAX, next.book + 1);
        bookFromSword = next.book !== before;
    }

    for (let mob = 1; mob <= MOB_COUNT; mob++) {
        if (killedSet.has(mob)) continue;
        const index = mob - 1;
        next.energy[index] = Math.min(ENERGY_MAX, next.energy[index] + 1);
    }

    return {
        state: next,
        startEnergy,
        killed: [...killed].sort((a, b) => a - b),
        actions,
        bookFromSword,
    };
}

/** 击杀组合：先按个数 0–4，同个数按小怪编号升序。 */
function killSubsets(): number[][] {
    const out: number[][] = [];
    const buf: number[] = [];
    const walk = (start: number, size: number) => {
        if (buf.length === size) {
            out.push([...buf]);
            return;
        }
        for (let mob = start; mob <= MOB_COUNT; mob++) {
            buf.push(mob);
            walk(mob + 1, size);
            buf.pop();
        }
    };
    for (let size = 0; size <= MOB_COUNT; size++) walk(1, size);
    return out;
}

export interface KillInference {
    killed: number[];
    sword: number;
    book: number;
    nextEnergy: Energy;
    bookFromSword: boolean;
}

/** 本回合全部击杀组合的剑、书、下回合能量。满能量时不加「剑>0 则书+1」。 */
export function inferRound(input: {
    energy: Energy;
    sword: number;
    book: number;
    fullEnergy: boolean;
}): KillInference[] {
    return killSubsets().map((killed) => {
        const settled = settleRound(
            { energy: input.energy, sword: input.sword, book: input.book },
            killed,
            input.fullEnergy,
        );
        return {
            killed: settled.killed,
            sword: settled.state.sword,
            book: settled.state.book,
            nextEnergy: cloneEnergy(settled.state.energy),
            bookFromSword: settled.bookFromSword,
        };
    });
}

/**
 * 本回合被击杀的小怪不行动，能量停在被击杀时（即回合开始时）。
 * 回合结束后复活，下一回合仍以该能量在场。
 * 周期第 4 回合视为孙静满能量，且剑×书必须等于目标回合数。
 */
function resolveRound(
    state: SimState,
    killed: readonly number[],
    round: number,
    target: number,
): { state: SimState; trace: RoundTrace } | null {
    const fullEnergy = round === ROUND_COUNT;
    const settled = settleRound(state, killed, fullEnergy);
    if (fullEnergy && settled.state.sword * settled.state.book !== target) return null;

    return {
        state: settled.state,
        trace: {
            round,
            startEnergy: settled.startEnergy,
            nextEnergy: cloneEnergy(settled.state.energy),
            killed: settled.killed,
            actions: settled.actions,
            sword: settled.state.sword,
            book: settled.state.book,
            bookFromSword: settled.bookFromSword,
        },
    };
}

function subsetsByPriority(alive: readonly number[], size: number): number[][] {
    const ordered = MOB_PRIORITY.filter((mob) => alive.includes(mob));
    const out: number[][] = [];
    const buf: number[] = [];

    const walk = (start: number) => {
        if (buf.length === size) {
            out.push([...buf]);
            return;
        }
        for (let i = start; i < ordered.length; i++) {
            buf.push(ordered[i]);
            walk(i + 1);
            buf.pop();
        }
    };

    walk(0);
    return out;
}

/** 当前存活小怪上，按击杀个数 4、1、2、3、0 展开的击杀集合。 */
export function enumerateKillSets(alive: readonly number[], allowed: readonly boolean[]): number[][] {
    const sets: number[][] = [];
    for (const count of KILL_COUNT_ORDER) {
        if (!allowed[count]) continue;
        if (count > alive.length) continue;
        sets.push(...subsetsByPriority(alive, count));
    }
    return sets;
}

const ENERGY_SPACE = (ENERGY_MAX + 1) ** MOB_COUNT;

if (OPEN_PLANS.length !== ENERGY_SPACE) {
    throw new Error(`离线方案表长度是 ${OPEN_PLANS.length}，应为 ${ENERGY_SPACE}`);
}

/** 全开时的击杀掩码，顺序与 enumerateKillSets 一致。bit0 = 1 号。 */
const OPEN_KILLS = enumerateKillSets(
    [1, 2, 3, 4],
    [true, true, true, true, true],
).map((killed) => ({
    mask: killed.reduce((bits, mob) => bits | (1 << (mob - 1)), 0),
    count: killed.length,
}));

function packEnergy(energy: Energy): number {
    return energy[0] | (energy[1] << 2) | (energy[2] << 4) | (energy[3] << 6);
}

function mobsOf(mask: number): number[] {
    const killed: number[] = [];
    for (let mob = 1; mob <= MOB_COUNT; mob++) {
        if (mask & (1 << (mob - 1))) killed.push(mob);
    }
    return killed;
}

function act(sword: number, book: number, mob: number): [number, number] {
    if (mob === 2 || mob === 4) return [sword, Math.min(BOOK_MAX, book + 1)];
    if (book >= 2) return [Math.min(SWORD_MAX, sword + 1), 0];
    return [sword, book];
}

/** 与 resolveRound 同一套结算，只是能量打成整数，方便把 256 种开局一次算完。 */
function step(
    energy: number,
    sword: number,
    book: number,
    kill: number,
    finalRound: boolean,
): [number, number, number] {
    for (let mob = 1; mob <= MOB_COUNT; mob++) {
        if (kill & (1 << (mob - 1))) continue;
        const shift = (mob - 1) * 2;
        const current = (energy >> shift) & 3;
        const times = current >= ENERGY_MAX ? 2 : 1;
        for (let t = 0; t < times; t++) {
            const next = act(sword, book, mob);
            sword = next[0];
            book = next[1];
        }
        if (current >= ENERGY_MAX) energy &= ~(3 << shift);
    }
    if (!finalRound && sword > 0) book = Math.min(BOOK_MAX, book + 1);
    for (let mob = 1; mob <= MOB_COUNT; mob++) {
        if (kill & (1 << (mob - 1))) continue;
        const shift = (mob - 1) * 2;
        const current = (energy >> shift) & 3;
        const grown = Math.min(ENERGY_MAX, current + 1);
        energy = (energy & ~(3 << shift)) | (grown << shift);
    }
    return [energy, sword, book];
}

function allCountsAllowed(allowed: PlanInput['allowedCounts']): boolean {
    for (let round = 0; round < ROUND_COUNT; round++) {
        const row = allowed[round];
        for (let count = 0; count <= MOB_COUNT; count++) {
            if (!row?.[count]) return false;
        }
    }
    return true;
}

function decodeMasks(hex: string): number[] {
    const masks: number[] = [];
    for (let i = 0; i < hex.length; i++) masks.push(Number.parseInt(hex[i], 16));
    return masks;
}

/**
 * 现搜 [targetStart, targetEnd] 内的四回合周期；不要求接到终止目标之后。
 */
export function searchPlanMasks(input: PlanInput): number[] | null {
    const startIndex = TARGET_ROUNDS.indexOf(input.targetStart);
    const endIndex = TARGET_ROUNDS.indexOf(input.targetEnd);
    if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return null;

    const memo = new Map<number, number[] | null>();

    const solve = (packed: number, targetIndex: number): number[] | null => {
        const key = targetIndex * ENERGY_SPACE + packed;
        const cached = memo.get(key);
        if (cached !== undefined) return cached;

        const target = TARGET_ROUNDS[targetIndex];
        const chosen = [0, 0, 0, 0];

        const dfs = (round: number, energy: number, sword: number, book: number): boolean => {
            if (round === ROUND_COUNT) {
                const next = targetIndex + 1;
                if (next > endIndex) return true;
                return solve(energy, next) !== null;
            }
            const allowed = input.allowedCounts[round] ?? [];
            for (const kill of OPEN_KILLS) {
                if (!allowed[kill.count]) continue;
                const [nextEnergy, nextSword, nextBook] = step(
                    energy,
                    sword,
                    book,
                    kill.mask,
                    round === ROUND_COUNT - 1,
                );
                if (round === ROUND_COUNT - 1 && nextSword * nextBook !== target) continue;
                chosen[round] = kill.mask;
                if (dfs(round + 1, nextEnergy, nextSword, nextBook)) return true;
            }
            return false;
        };

        const plan = dfs(0, packed, 0, 0) ? chosen.slice() : null;
        memo.set(key, plan);
        return plan;
    };

    const masks: number[] = [];
    let packed = packEnergy(input.energy);
    for (let targetIndex = startIndex; targetIndex <= endIndex; targetIndex++) {
        const part = solve(packed, targetIndex);
        if (!part) return null;
        masks.push(...part);
        let sword = 0;
        let book = 0;
        for (let round = 0; round < ROUND_COUNT; round++) {
            const next = step(packed, sword, book, part[round], round === ROUND_COUNT - 1);
            packed = next[0];
            sword = next[1];
            book = next[2];
        }
    }
    return masks;
}

function replay(start: Energy, targetStart: TargetRound, masks: readonly number[]): RoundTrace[] {
    const traces: RoundTrace[] = [];
    const startIndex = TARGET_ROUNDS.indexOf(targetStart);
    const cycles = masks.length / ROUND_COUNT;
    /** 表格回合号：起始目标 - 3 起递增 */
    const firstRound = targetStart - 3;
    let energy = cloneEnergy(start);

    for (let cycle = 0; cycle < cycles; cycle++) {
        const cycleTarget = TARGET_ROUNDS[startIndex + cycle];
        let state: SimState = { energy: cloneEnergy(energy), sword: 0, book: 0 };
        for (let round = 1; round <= ROUND_COUNT; round++) {
            const resolved = resolveRound(
                state,
                mobsOf(masks[cycle * ROUND_COUNT + round - 1]),
                round,
                cycleTarget,
            );
            if (!resolved) {
                throw new Error(`方案无法结算：目标 ${cycleTarget} 的第 ${round} 回合`);
            }
            resolved.trace.round = firstRound + cycle * ROUND_COUNT + round - 1;
            traces.push(resolved.trace);
            state = resolved.state;
        }
        energy = state.energy;
    }

    return traces;
}

/**
 * 击杀数量全开时读 plans.ts。
 * 每列是「从该起始目标接到 16」的完整掩码；按终止目标截取前缀。
 * 接不到 16 时返回 null，由 findPlan 再按精确区间现搜。
 */
function openPlanMasks(
    energy: Energy,
    targetStart: TargetRound,
    targetEnd: TargetRound,
): number[] | null {
    const startIndex = TARGET_ROUNDS.indexOf(targetStart);
    const endIndex = TARGET_ROUNDS.indexOf(targetEnd);
    if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return null;

    const hex = OPEN_PLANS[packEnergy(energy)]?.[startIndex] ?? '';
    if (!hex) return null;

    const fullLen = cycleCount(targetStart, 16) * ROUND_COUNT;
    if (hex.length !== fullLen) {
        throw new Error(`离线方案长度是 ${hex.length}，起始 ${targetStart} 应为 ${fullLen}`);
    }

    const need = cycleCount(targetStart, targetEnd) * ROUND_COUNT;
    return decodeMasks(hex.slice(0, need));
}

/**
 * 在 [targetStart, targetEnd] 内每 4 回合打出对应目标。
 * 剑、书每 4 回合从 0 重计。击杀数量全开时优先读 plans.ts。
 */
export function findPlan(input: PlanInput): RoundTrace[] | null {
    if (input.targetStart > input.targetEnd) return null;
    const masks = allCountsAllowed(input.allowedCounts)
        ? (openPlanMasks(input.energy, input.targetStart, input.targetEnd) ??
          searchPlanMasks(input))
        : searchPlanMasks(input);
    if (!masks) return null;
    return replay(input.energy, input.targetStart, masks);
}

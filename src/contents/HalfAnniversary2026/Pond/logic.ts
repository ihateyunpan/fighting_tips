/** 半周年庞德谜域：红盾 / 红圈 */

export const BOSS_ENERGY_MAX = 4;
export const SHIELD_WRAP = 5;
export const PREVIEW_MAX_ROUND = 19;
export const TEAM_SIZE_MIN = 1;
export const TEAM_SIZE_MAX = 5;

export interface SpecialFlags {
    chant: boolean;
    silence: boolean;
    def3: boolean;
}

export const DEFAULT_SPECIALS: SpecialFlags = {
    chant: false,
    silence: false,
    def3: true,
};

/** Mechanically distinct outcomes when boss energy is full (preview branches) */
export const PREVIEW_SPECIAL_VARIANTS: SpecialFlags[] = [
    { chant: false, silence: true, def3: true },
    { chant: true, silence: false, def3: true },
    { chant: false, silence: false, def3: true },
    { chant: false, silence: false, def3: false },
];

export interface SimState {
    round: number;
    bossEnergy: number;
    normalAttackCount: number;
    shields: number[];
    wiped: boolean;
}

export interface RoundInput {
    redCircle: number;
    specials: SpecialFlags;
}

export interface RoundRow {
    round: number;
    bossEnergy: number;
    shields: number[];
    redCircle: number | null;
    specials: SpecialFlags;
    wiped: boolean;
    locked: boolean;
}

export function formatBossEnergy(energy: number): string {
    return String(energy);
}

export function isFullBossEnergy(energy: number): boolean {
    return energy === BOSS_ENERGY_MAX;
}

export function createZeroShields(teamSize: number): number[] {
    return Array.from({ length: teamSize }, () => 0);
}

export function createInitialSimState(teamSize: number): SimState {
    return {
        round: 1,
        bossEnergy: 1,
        normalAttackCount: 0,
        shields: createZeroShields(teamSize),
        wiped: false,
    };
}

export function incrementShield(value: number): number {
    const next = value + 1;
    return next >= SHIELD_WRAP ? 0 : next;
}

export function addShieldAt(shields: number[], index: number): number[] {
    const next = shields.slice();
    next[index] = incrementShield(next[index]);
    return next;
}

/** 1-indexed position → 0-indexed */
export function positionToIndex(pos: number): number {
    return pos - 1;
}

export function prevPosition(pos: number, teamSize: number): number {
    return pos === 1 ? teamSize : pos - 1;
}

export function nextPosition(pos: number, teamSize: number): number {
    return pos === teamSize ? 1 : pos + 1;
}

export function hasInstantKill(shields: number[]): boolean {
    const counts = new Map<number, number>();
    for (const layer of shields) {
        if (layer <= 0) continue;
        const n = (counts.get(layer) ?? 0) + 1;
        if (n >= 3) return true;
        counts.set(layer, n);
    }
    return false;
}

function applyNormalAttack(
    shields: number[],
    teamSize: number,
    redCircle: number,
    normalAttackCount: number,
): { shields: number[]; normalAttackCount: number } {
    const count = normalAttackCount + 1;
    const mod = count % 3;
    const idx = positionToIndex(redCircle);

    let next = shields;
    if (mod === 1) {
        next = addShieldAt(next, idx);
    } else if (mod === 2) {
        const prev = prevPosition(redCircle, teamSize);
        next = addShieldAt(next, idx);
        next = addShieldAt(next, positionToIndex(prev));
    } else {
        const nxt = nextPosition(redCircle, teamSize);
        next = addShieldAt(next, idx);
        next = addShieldAt(next, positionToIndex(nxt));
    }

    return { shields: next, normalAttackCount: count };
}

function applySkill(
    shields: number[],
    teamSize: number,
    specials: SpecialFlags,
): number[] {
    if (specials.chant) {
        return shields;
    }
    const delta = specials.def3 ? 1 : 2;
    let next = shields;
    for (let i = 0; i < teamSize; i++) {
        for (let d = 0; d < delta; d++) {
            next = addShieldAt(next, i);
        }
    }
    return next;
}

function advanceBossEnergyAfterRound(bossEnergy: number, usedSkill: boolean): number {
    let energy = usedSkill ? 0 : bossEnergy;
    energy += 1;
    return Math.min(energy, BOSS_ENERGY_MAX);
}

/** Resolve one round; mutates logical outcome only via return value */
export function processRound(
    state: SimState,
    teamSize: number,
    input: RoundInput,
): SimState {
    if (state.wiped) {
        return state;
    }

    const useSkill =
        isFullBossEnergy(state.bossEnergy) && !input.specials.silence;

    let shields = state.shields;
    let normalAttackCount = state.normalAttackCount;
    let bossEnergy = state.bossEnergy;

    if (useSkill) {
        shields = applySkill(shields, teamSize, input.specials);
        bossEnergy = 0;
    } else {
        const attack = applyNormalAttack(
            shields,
            teamSize,
            input.redCircle,
            normalAttackCount,
        );
        shields = attack.shields;
        normalAttackCount = attack.normalAttackCount;
    }

    const wiped = hasInstantKill(shields);
    const nextEnergy = advanceBossEnergyAfterRound(bossEnergy, useSkill);

    return {
        round: state.round + 1,
        bossEnergy: nextEnergy,
        normalAttackCount,
        shields,
        wiped,
    };
}

export function simFromInputs(
    teamSize: number,
    inputs: RoundInput[],
): SimState {
    let state = createInitialSimState(teamSize);
    for (const input of inputs) {
        state = processRound(state, teamSize, input);
        if (state.wiped) break;
    }
    return state;
}

export function createInitialRow(teamSize: number): RoundRow {
    return {
        round: 1,
        bossEnergy: 1,
        shields: createZeroShields(teamSize),
        redCircle: null,
        specials: { ...DEFAULT_SPECIALS },
        wiped: false,
        locked: false,
    };
}

export interface RowDraft {
    redCircle: number | null;
    specials: SpecialFlags;
}

export function rowDraftFromRow(row: RoundRow): RowDraft {
    return {
        redCircle: row.redCircle,
        specials: { ...row.specials },
    };
}

export function rowsToDrafts(rows: RoundRow[]): RowDraft[] {
    return rows.map(rowDraftFromRow);
}

export function rowsToInputs(rows: RoundRow[]): RoundInput[] {
    return rows
        .filter((r) => r.redCircle != null)
        .map((r) => ({
            redCircle: r.redCircle as number,
            specials: { ...r.specials },
        }));
}

/**
 * Recompute display rows from draft inputs (last row may be open).
 * Each row's shields are the start-of-round state from prior rounds only;
 * the current draft's red circle / specials never rewrite that row's shields.
 */
export function computeRowsFromDrafts(teamSize: number, drafts: RowDraft[]): RoundRow[] {
    if (drafts.length === 0) {
        return [createInitialRow(teamSize)];
    }

    let state = createInitialSimState(teamSize);
    const result: RoundRow[] = [];

    for (let i = 0; i < drafts.length; i++) {
        const draft = drafts[i];
        const isLast = i === drafts.length - 1;
        const redCircle = draft.redCircle;
        const specials = { ...draft.specials };

        if (state.wiped) {
            break;
        }

        // Shields freeze at round creation (derived from previous rounds only).
        const row: RoundRow = {
            round: state.round,
            bossEnergy: state.bossEnergy,
            shields: state.shields.slice(),
            redCircle,
            specials,
            wiped: false,
            locked: !isLast,
        };

        if (redCircle == null) {
            result.push(row);
            break;
        }

        const after = processRound(state, teamSize, { redCircle, specials });
        if (!isLast) {
            row.wiped = after.wiped;
        }
        result.push(row);

        if (after.wiped) {
            break;
        }

        state = after;
    }

    return result;
}

export function rebuildRows(teamSize: number, drafts: RowDraft[]): RoundRow[] {
    return computeRowsFromDrafts(teamSize, drafts);
}

export function appendRoundDraft(drafts: RowDraft[], teamSize: number): RowDraft[] {
    const rows = computeRowsFromDrafts(teamSize, drafts);
    const last = rows[rows.length - 1];
    if (!last || last.redCircle == null || last.wiped) {
        return drafts;
    }
    return [...drafts, { redCircle: null, specials: { ...DEFAULT_SPECIALS } }];
}

export function deleteDraftFrom(drafts: RowDraft[], index: number): RowDraft[] {
    if (index < 0 || index >= drafts.length) {
        return drafts;
    }
    const kept = drafts.slice(0, index);
    if (kept.length === 0) {
        return [{ redCircle: null, specials: { ...DEFAULT_SPECIALS } }];
    }
    return kept;
}

export function updateLastDraft(
    drafts: RowDraft[],
    patch: Partial<RowDraft> & { specials?: Partial<SpecialFlags> },
): RowDraft[] {
    if (drafts.length === 0) {
        return [{ redCircle: null, specials: { ...DEFAULT_SPECIALS } }];
    }
    const next = drafts.map((d) => ({
        redCircle: d.redCircle,
        specials: { ...d.specials },
    }));
    const lastIndex = next.length - 1;
    const last = next[lastIndex];
    next[lastIndex] = {
        redCircle: patch.redCircle !== undefined ? patch.redCircle : last.redCircle,
        specials: patch.specials ? { ...last.specials, ...patch.specials } : last.specials,
    };
    return next;
}

export function changeTeamSize(newSize: number): { teamSize: number; drafts: RowDraft[] } {
    const teamSize = Math.min(TEAM_SIZE_MAX, Math.max(TEAM_SIZE_MIN, newSize));
    return {
        teamSize,
        drafts: [{ redCircle: null, specials: { ...DEFAULT_SPECIALS } }],
    };
}

function simStateKey(state: SimState): string {
    return [
        state.round,
        state.bossEnergy,
        state.normalAttackCount,
        state.shields.join(','),
    ].join('|');
}

/**
 * From current sim state onward (round N+1 …): red circle may be any position each round.
 * - Non–full-energy rounds: ∃ one red circle leading to round > PREVIEW_MAX_ROUND.
 * - Full-energy (boss skill) rounds: for every special variant, ∃ one red circle with such a path.
 */
export function existsPathToRound19(
    state: SimState,
    teamSize: number,
    memo = new Map<string, boolean>(),
): boolean {
    if (state.wiped) {
        return false;
    }
    if (state.round > PREVIEW_MAX_ROUND) {
        return true;
    }

    const key = simStateKey(state);
    const cached = memo.get(key);
    if (cached !== undefined) {
        return cached;
    }

    let ok: boolean;

    if (isFullBossEnergy(state.bossEnergy)) {
        ok = true;
        for (const specials of PREVIEW_SPECIAL_VARIANTS) {
            let variantOk = false;
            for (let pos = 1; pos <= teamSize; pos++) {
                const next = processRound(state, teamSize, { redCircle: pos, specials });
                if (!next.wiped && existsPathToRound19(next, teamSize, memo)) {
                    variantOk = true;
                    break;
                }
            }
            if (!variantOk) {
                ok = false;
                break;
            }
        }
    } else {
        ok = false;
        for (let pos = 1; pos <= teamSize; pos++) {
            const next = processRound(state, teamSize, {
                redCircle: pos,
                specials: { ...DEFAULT_SPECIALS },
            });
            if (!next.wiped && existsPathToRound19(next, teamSize, memo)) {
                ok = true;
                break;
            }
        }
    }

    memo.set(key, ok);
    return ok;
}

/** Round N uses fixed red circle + user specials; rounds N+1…19 use existsPathToRound19 */
export function isRedCircleSafe(
    teamSize: number,
    completedInputs: RoundInput[],
    pendingRound: RoundInput,
): boolean {
    let state = createInitialSimState(teamSize);
    for (const input of completedInputs) {
        state = processRound(state, teamSize, input);
        if (state.wiped) {
            return false;
        }
    }

    state = processRound(state, teamSize, { ...pendingRound });
    if (state.wiped) {
        return false;
    }

    return existsPathToRound19(state, teamSize);
}

export function safeRedCircleOptions(
    teamSize: number,
    completedInputs: RoundInput[],
    pendingSpecials: SpecialFlags,
): boolean[] {
    const flags: boolean[] = [];
    for (let pos = 1; pos <= teamSize; pos++) {
        const pending: RoundInput = {
            redCircle: pos,
            specials: { ...pendingSpecials },
        };
        flags.push(isRedCircleSafe(teamSize, completedInputs, pending));
    }
    return flags;
}

export function completedInputsBeforeRow(rows: RoundRow[], beforeIndex: number): RoundInput[] {
    return rows
        .slice(0, beforeIndex)
        .filter((r) => r.redCircle != null)
        .map((r) => ({
            redCircle: r.redCircle as number,
            specials: { ...r.specials },
        }));
}

import type {
    ActionItem,
    ActionType,
    OperationGroup,
    OperationRequirementData
} from './operationRequirementTypes';

/** 操作序列：有序操作路径 + 每个操作解析后的具体类型 */
export interface OperationSequence {
    path: ActionItem[];
    resolvedTypes: Map<string, ActionType>;
}

export interface GroupMatchResult {
    groupId: string;
    hardMet: boolean;
    softScore: number;
}

export interface OperationMatchResult {
    hardMet: boolean;
    softScore: number;
    groups: GroupMatchResult[];
}

/** 同序列表靠前操作组优先于组内软分；权重需大于单组可能出现的最大软分 */
const SOFT_SCORE_GROUP_ORDER_WEIGHT = 1_000_000;

const isCircleAction = (action: ActionItem) => action.types.includes('圈');

const pathUsesGroupActions = (sequence: OperationSequence, groupActions: ActionItem[]): boolean => {
    if (sequence.path.length !== groupActions.length) return false;
    const groupIds = new Set(groupActions.map(a => a.id));
    const pathIds = sequence.path.map(a => a.id);
    if (pathIds.length !== new Set(pathIds).size) return false;
    return pathIds.every(id => groupIds.has(id));
};

export const buildDependencies = (actions: ActionItem[]) => {
    const dependencies = new Map<string, Set<string>>();
    const idToAction = new Map<string, ActionItem>();
    actions.forEach(a => {
        idToAction.set(a.id, a);
        if (!dependencies.has(a.id)) dependencies.set(a.id, new Set());
    });
    const slotsMap = new Map<number, ActionItem[]>();
    actions.forEach(a => {
        if (!slotsMap.has(a.slotIndex)) slotsMap.set(a.slotIndex, []);
        slotsMap.get(a.slotIndex)!.push(a);
    });
    slotsMap.forEach(group => {
        for (let i = 1; i < group.length; i++) {
            dependencies.get(group[i].id)!.add(group[i - 1].id);
        }
    });
    actions.forEach(a => {
        if (a.constraint === 'IMMEDIATE' && a.immediateTargetId && idToAction.has(a.immediateTargetId)) {
            dependencies.get(a.id)!.add(a.immediateTargetId);
        }
        if (a.constraint === 'RELATIVE') {
            a.relativeRules.forEach(rule => {
                if (!rule.targetId || !idToAction.has(rule.targetId)) return;
                if (rule.type === 'AFTER') dependencies.get(a.id)!.add(rule.targetId);
                else if (rule.type === 'BEFORE' && dependencies.has(rule.targetId)) {
                    dependencies.get(rule.targetId)!.add(a.id);
                }
            });
        }
    });
    return { dependencies };
};

/** 打分逻辑同 commit a3a6d45 */
export const calculatePreferenceScore = (path: ActionItem[]) => {
    let score = 0;
    const pathIds = path.map(a => a.id);

    path.forEach((action, currentIndex) => {
        const effectiveSequence = path.slice(0, currentIndex + 1).filter(a => !a.types.includes('圈'));
        const currentEffectiveIndex = effectiveSequence.length;

        (action.preferences || []).forEach(pref => {
            let met = false;
            switch (pref.type) {
                case 'EARLY':
                    score += (10 - currentIndex);
                    break;
                case 'LATE':
                    score += currentIndex;
                    break;
                case 'FIXED': {
                    const targetIdx = pref.fixedIndex || 1;
                    const op = pref.fixedOperator || 'AT';
                    if (action.types.includes('圈')) break;
                    if (op === 'AT' && currentEffectiveIndex === targetIdx) met = true;
                    else if (op === 'BEFORE' && currentEffectiveIndex < targetIdx) met = true;
                    else if (op === 'AFTER' && currentEffectiveIndex > targetIdx) met = true;
                    break;
                }
                case 'RELATIVE': {
                    if (!pref.targetId) break;
                    const targetPos = pathIds.indexOf(pref.targetId);
                    if (targetPos === -1) break;
                    if (pref.relativeType === 'BEFORE' && currentIndex < targetPos) met = true;
                    if (pref.relativeType === 'AFTER' && currentIndex > targetPos) met = true;
                    break;
                }
            }
            if (met) score += 100;
        });
    });
    return score;
};

const hasValidResolvedTypes = (sequence: OperationSequence, groupActions: ActionItem[]): boolean => {
    const groupById = new Map(groupActions.map(a => [a.id, a]));
    for (const step of sequence.path) {
        const action = groupById.get(step.id);
        if (!action) return false;
        const chosen = sequence.resolvedTypes.get(step.id);
        if (!chosen) return false;
        if (isCircleAction(action)) {
            if (chosen !== '圈') return false;
        } else if (!action.types.includes(chosen) || chosen === '圈') {
            return false;
        }
    }
    return true;
};

/**
 * 将 action 接在 pathPrefix 后是否仍满足该操作组的硬性约束（与 satisfiesHardConstraints 逐步校验一致）。
 * pathPrefix 为已放置前缀，不含当前 action。
 */
const hardStepAllowsAppend = (
    pathPrefix: ActionItem[],
    action: ActionItem,
    groupActions: ActionItem[],
    dependencies: Map<string, Set<string>>
): boolean => {
    const groupIds = new Set(groupActions.map(a => a.id));
    if (!groupIds.has(action.id)) return false;

    const isCircle = isCircleAction(action);
    const effectiveCountSoFar = pathPrefix.filter(a => !isCircleAction(a)).length;
    const nextEffectiveIndex = effectiveCountSoFar + (isCircle ? 0 : 1);

    if (action.constraint === 'FIXED') {
        if (isCircle) return false;
        const targetIndex = action.fixedIndex || 1;
        const op = action.fixedOperator || 'AT';
        if (op === 'AT' && nextEffectiveIndex !== targetIndex) return false;
        if (op === 'BEFORE' && !(nextEffectiveIndex < targetIndex)) return false;
        if (op === 'AFTER' && !(nextEffectiveIndex > targetIndex)) return false;
    }
    if (action.constraint === 'IMMEDIATE') {
        if (pathPrefix.length === 0) return false;
        if (pathPrefix[pathPrefix.length - 1].id !== action.immediateTargetId) return false;
    }

    const used = new Set(pathPrefix.map(a => a.id));
    const parents = dependencies.get(action.id);
    if (parents) {
        for (const pid of parents) {
            if (!used.has(pid)) return false;
        }
    }

    return true;
};

/** DFS 剪枝：判断能否将 action 放入当前部分路径（仅硬性要求） */
export const canPlaceActionInPath = (
    path: ActionItem[],
    action: ActionItem,
    groupActions: ActionItem[]
): boolean =>
    hardStepAllowsAppend(
        path,
        action,
        groupActions,
        buildDependencies(groupActions).dependencies
    );

/** 完整操作序列是否满足该操作组的全部硬性要求 */
export const satisfiesHardConstraints = (
    sequence: OperationSequence,
    groupActions: ActionItem[]
): boolean => {
    if (!pathUsesGroupActions(sequence, groupActions)) return false;
    if (!hasValidResolvedTypes(sequence, groupActions)) return false;

    const { path } = sequence;
    const { dependencies } = buildDependencies(groupActions);
    for (let i = 0; i < path.length; i++) {
        if (!hardStepAllowsAppend(path.slice(0, i), path[i], groupActions, dependencies)) {
            return false;
        }
    }

    return true;
};

export const evaluateGroupMatch = (
    group: OperationGroup,
    sequence: OperationSequence
): GroupMatchResult => {
    if (!pathUsesGroupActions(sequence, group.actions)) {
        return { groupId: group.id, hardMet: false, softScore: 0 };
    }
    const hardMet = satisfiesHardConstraints(sequence, group.actions);
    const softScore = calculatePreferenceScore(sequence.path);
    return { groupId: group.id, hardMet, softScore };
};

const tieredSoftScore = (softScore: number, groupIndex: number, groupCount: number) =>
    softScore + (groupCount - 1 - groupIndex) * SOFT_SCORE_GROUP_ORDER_WEIGHT;

export const evaluateOperationMatch = (
    requirementData: OperationRequirementData,
    sequence: OperationSequence
): OperationMatchResult => {
    const n = requirementData.groups.length;
    const groups = requirementData.groups.map(g => evaluateGroupMatch(g, sequence));
    const hardMetGroups = groups.filter(g => g.hardMet);
    const hardMet = hardMetGroups.length > 0;
    const softScore = hardMet
        ? Math.max(
              ...groups.map((g, i) =>
                  g.hardMet ? tieredSoftScore(g.softScore, i, n) : Number.NEGATIVE_INFINITY
              )
          )
        : Math.max(0, ...groups.map((g, i) => tieredSoftScore(g.softScore, i, n)));
    return { hardMet, softScore, groups };
};

export const toOperationSequence = (
    path: ActionItem[],
    resolvedTypes: Map<string, ActionType>
): OperationSequence => ({
    path: [...path],
    resolvedTypes: new Map(resolvedTypes)
});

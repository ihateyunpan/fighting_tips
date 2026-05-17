// --- Schema: 操作要求 & 操作序列 ---

export type ActionType = 'A' | '↑' | '↓' | '圈';
export type ElementType = '地' | '水' | '火' | '风' | '阴' | '阳' | '混沌';
export type ConstraintType = 'NONE' | 'FIXED' | 'RELATIVE' | 'IMMEDIATE';
export type RelativeType = 'BEFORE' | 'AFTER';
export type FixedOperator = 'AT' | 'BEFORE' | 'AFTER';
export type PreferenceType = 'FIXED' | 'RELATIVE' | 'EARLY' | 'LATE';

export interface PreferenceRule {
    id: string;
    type: PreferenceType;
    fixedIndex?: number;
    fixedOperator?: FixedOperator;
    targetId?: string;
    relativeType?: RelativeType;
}

export interface RelativeRule {
    id: string;
    type: RelativeType;
    targetId: string;
}

export interface ActionItem {
    id: string;
    types: ActionType[];
    slotIndex: number;
    constraint: ConstraintType;
    fixedIndex?: number;
    fixedOperator?: FixedOperator;
    relativeRules: RelativeRule[];
    immediateTargetId?: string;
    preferences: PreferenceRule[];
}

export interface ActionSlot {
    index: number;
    element: ElementType;
}

export interface OperationGroup {
    id: string;
    /** 操作组显示名称，缺省时按序号生成 */
    name?: string;
    actions: ActionItem[];
}

export interface OperationRequirementData {
    groups: OperationGroup[];
}

export const generateActionId = () => Math.random().toString(36).substr(2, 9);

export const createDefaultActionItem = (slotIndex: number): ActionItem => ({
    id: generateActionId(),
    types: ['A', '↑', '↓'],
    slotIndex,
    constraint: 'NONE',
    relativeRules: [],
    preferences: []
});

export const DEFAULT_SLOT_BORDER_CLASS = 'border-slate-200';

export const normalizeActionItem = (raw: Partial<ActionItem> & { id: string }): ActionItem => ({
    id: raw.id,
    types: raw.types ?? ['A', '↑', '↓'],
    slotIndex: raw.slotIndex ?? 0,
    constraint: raw.constraint ?? 'NONE',
    fixedIndex: raw.fixedIndex,
    fixedOperator: raw.fixedOperator,
    relativeRules: raw.relativeRules ?? [],
    immediateTargetId: raw.immediateTargetId,
    preferences: raw.preferences ?? []
});

export const createDefaultOperationGroup = (index = 0): OperationGroup => ({
    id: generateActionId(),
    name: `操作组${index + 1}`,
    actions: []
});

export const normalizeOperationRequirementData = (
    raw?: Partial<OperationRequirementData>,
    legacyActions?: ActionItem[]
): OperationRequirementData => {
    if (raw?.groups && raw.groups.length > 0) {
        return {
            groups: raw.groups.map((g, i) => ({
                id: g.id ?? generateActionId(),
                name: g.name ?? `操作组${i + 1}`,
                actions: (g.actions ?? []).map(a => normalizeActionItem(a))
            }))
        };
    }
    if (legacyActions && legacyActions.length > 0) {
        return {
            groups: [{
                id: generateActionId(),
                name: '操作组1',
                actions: legacyActions.map(a => normalizeActionItem(a))
            }]
        };
    }
    return { groups: [] };
};

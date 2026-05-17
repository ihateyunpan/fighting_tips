import type { ActionItem, ActionType } from './operationRequirementTypes';

export const getDisplayId = (targetId: string, currentActions: ActionItem[]) => {
    const target = currentActions.find(a => a.id === targetId);
    if (!target) return '??';
    const slotOps = currentActions.filter(a => a.slotIndex === target.slotIndex);
    const index = slotOps.findIndex(a => a.id === targetId);
    return `${target.slotIndex + 1}${String.fromCharCode(97 + index)}`;
};

export const getActionLabel = (types: ActionType[]) => {
    if (types.includes('圈')) return '圈';
    const resorted: string[] = [];
    const hasA = types.includes('A');
    const hasUp = types.includes('↑');
    const hasDown = types.includes('↓');
    if (hasA && hasUp && hasDown) return '任意';
    if (hasA) resorted.push('A');
    if (hasUp) resorted.push('↑');
    if (hasDown) resorted.push('↓');
    return resorted.join('/');
};

import { type EventKey } from './events';

export interface Level {
    id: string;
    name: string; // 关卡名字
    event: EventKey;  // 活动名字
    level: string; // 关卡层数
}

export const levels: Level[] = [
    { id: '1', name: '驿站惯偷', event: 'HUI_XIANG_LU', level: '第5层' },
    { id: '2', name: '法正', event: 'DUNGEON_19', level: '遗迹4' },
    { id: '3', name: '诸葛亮考核', event: 'KPI', level: '' },
    { id: '4', name: '荀攸考核', event: 'KPI', level: '' },
    { id: '5', name: '袁术', event: 'YUAN2026', level: '归来兮5' },
    { id: '6', name: '董奉', event: 'YUAN2026', level: '归来兮3' },
    { id: '999', name: '法正', event: 'AGENT', level: '' },
];
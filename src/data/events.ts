/* src/data/events.ts */

export interface EventMeta {
    id: string;      // 用于排序
    name: string;    // 显示名称
    active: boolean; // 是否激活（NavBar显示控制）
}

// 使用 Record 定义类似 Enum 的常量对象
export const EVENTS = {
    HUI_XIANG_LU: { id: '1', name: '回乡路', active: false },
    DUNGEON_19: { id: '2', name: '十九期地宫', active: false },
    KPI: { id: '3', name: '夜以继日的绩效考核', active: true },
    AGENT: { id: '999', name: '密探', active: true },
} as const;

// 导出类型，方便在 levels.ts 里引用 key
export type EventKey = keyof typeof EVENTS;

// 辅助函数：根据 Key 获取 Meta
export const getEventMeta = (key: string): EventMeta => {
    return EVENTS[key as EventKey] || { id: '0', name: '未知活动', active: false };
};
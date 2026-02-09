// --- 类型定义 ---

type Grade = 'GREY' | 'BLUE' | 'PURPLE' | 'GOLD' | 'RED';

// [修改] Badge 结构定义
interface BadgeDef {
    text: string;
    color?: Grade; // 可选，不填则默认使用圣物自身的 Grade
}

// [修改] RelicDef 接口
interface RelicDef {
    id: string;
    name: string;
    grade: Grade;
    badges: BadgeDef[]; // 从 string[] 改为 BadgeDef[]
    desc: string;
}

// [修改] ComboDef 接口
interface ComboDef {
    id: string;
    relicIds: string[];
    badges: BadgeDef[]; // 同样修改这里
    desc: string;
}

// --- 常量数据 (模拟数据，可根据实际游戏内容替换) ---
const GRADES: Record<Grade, { color: string; bg: string; border: string; refund: number }> = {
    'GREY': { color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200', refund: 0 },
    'BLUE': { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', refund: 1 },
    'PURPLE': { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', refund: 2 },
    'GOLD': { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', refund: 4 },
    'RED': { color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', refund: 6 },
};

// 13个圣物数据
const RELICS: RelicDef[] = [
    {
        id: 'r1', name: '乐毅的马鞭', grade: 'BLUE', badges: [
            { text: "技能攻击x1", color: "BLUE" },
        ], desc: '对当前目标造成100%攻击力的技能伤害'
    },
    {
        id: 'r2', name: '扁鹊的药罐', grade: 'BLUE', badges: [
            { text: "群体护盾", color: "BLUE" },
        ], desc: '为我方全员附加护盾（1回合，可叠加）护盾量为自身20%的攻击力'
    },
    {
        id: 'r3', name: '管仲的护膝', grade: 'BLUE', badges: [
            { text: "攻击↑", color: "BLUE" },
            { text: "技能攻击x1", color: "BLUE" },
        ], desc: '提升我方全员10%攻击力（1回合，可叠加），对敌方全体造成30%攻击力的技能伤害'
    },
    {
        id: 'r4',
        name: '霍去病的眼镜',
        grade: 'PURPLE',
        badges: [
            { text: "技能攻击x2", color: "BLUE" },
        ],
        desc: '对当前目标造成两次150%攻击力的技能伤害'
    },
    {
        id: 'r5', name: '黄石公的鞋拔子', grade: 'PURPLE', badges: [
            { text: "技能攻击x1", color: "BLUE" },
            { text: "敌全攻击↓", color: "PURPLE" },
            { text: "敌全免伤↓", color: "PURPLE" },
        ], desc: '对敌方全体造成120%攻击力的技能伤害，降低敌方全体20%攻击力和20免伤值（2回合）'
    },
    {
        id: 'r6', name: '卫青的钓竿', grade: 'PURPLE', badges: [
            { text: "攻击↑", color: "PURPLE" },
            { text: "生命上限↑", color: "PURPLE" },
        ], desc: '提升我方全体20%攻击力和20%最大生命'
    },
    {
        id: 'r7', name: '始皇的按摩梳', grade: 'GOLD', badges: [
            { text: "技能攻击x3", color: "PURPLE" },
        ], desc: '对当前目标造成三次200%攻击力的技能伤害'
    },
    {
        id: 'r8', name: '高祖的文凭', grade: 'GOLD', badges: [
            { text: "技能攻击x1", color: "PURPLE" },
            { text: "每次技伤敌技能免伤↓", color: "PURPLE" },
        ], desc: '为当前目标附加【虚证】（3回合），随后对其造成300%攻击力的技能伤害。【虚证】：受到技能伤害时，技能免伤降低5（3回合，可叠加20层）'
    },
    {
        id: 'r9', name: '文帝的遮阳伞', grade: 'GOLD', badges: [
            { text: "阴增伤↑", color: "GOLD" }
        ], desc: '提升我方全体30阴属性增伤和30技能增伤（3回合）'
    },
    {
        id: 'r10',
        name: '武帝的饭碗',
        grade: 'GOLD',
        badges: [
            { text: '群体回血', color: 'GOLD' },
            { text: '群体护盾', color: 'PURPLE' },
        ],
        desc: '恢复我方全员30%最大生命，并为我方全员附加护盾（2回合，可叠加），护盾量为自身15%最大生命'
    },
    {
        id: 'r11', name: '炎帝的锄头', grade: 'RED', badges: [
            { text: '单体技能攻击x4', color: 'GOLD' },
            { text: '⚠️混乱自身', color: 'GREY' },
        ], desc: '对当前目标造成4次400%攻击力的技能伤害，随后使自身【混乱】（2回合）。【混乱】：无法行动'
    },
    {
        id: 'r12', name: '黄帝的内经', grade: 'RED', badges: [
            { text: "攻击↑", color: 'RED' },
            { text: "阴增伤↑", color: 'RED' },
            { text: "⚠️普攻免伤↓", color: 'GREY' },
            { text: "⚠️技能免伤↓", color: 'GREY' },
        ], desc: '提升我方全员50%攻击力和50阴属性增伤（3回合），我方全员的普攻免伤和技能免伤降低50（2回合）'
    },
    {
        id: 'r13',
        name: '蚩尤的坐骑',
        grade: 'RED',
        badges: [
            { text: "每次技伤敌-2%血", color: "RED" },
            { text: "⚠️法正-80%血", color: "GREY" },
        ],
        desc: '为当前目标附加【踏破】（3回合），对其造成500%攻击力的技能伤害，自身失去80%当前生命。【踏破】：每次受到技能伤害，失去2%当前生命'
    },
];

// 组合技示例
const COMBOS: ComboDef[] = [
    {
        id: 'c2',
        relicIds: ['r2', 'r10'],
        badges: [
            { text: '每回合回血', color: 'GOLD' },
        ],
        desc: '本场战斗中，回合开始时，恢复自身生命，恢复量为自身100%的攻击力'
    },
    {
        id: 'c3',
        relicIds: ['r4', 'r7'],
        badges: [
            { text: '法正技能攻击x2', color: 'GOLD' },
        ],
        desc: '对敌方全体造成2次1000%攻击力的技能伤害'
    },
    {
        id: 'c4',
        relicIds: ['r6', 'r9'],
        badges: [
            { text: '法正攻击↑', color: 'GOLD' },
            { text: '法正生命上限↑', color: 'GOLD' },
        ],
        desc: '本场战斗中，自身攻击力提升40%，最大生命提升40%'
    },
    {
        id: 'c5',
        relicIds: ['r7', 'r11'],
        badges: [
            { text: '解除混乱', color: 'RED' },
            { text: '法正技能增伤↑', color: 'GOLD' },
            { text: '法正行动后技能攻击x1', color: 'GOLD' },
        ],
        desc: '解除自身的【混乱】效果。本场战斗中，自身技能增伤提升40，并且每次行动后，对敌方全体造成100%攻击力的技能伤害'
    },
    {
        id: 'c6',
        relicIds: ['r9', 'r12'],
        badges: [
            { text: '群体免伤', color: 'RED' },
            { text: '法正阴增伤↑', color: 'GOLD' },
            { text: '法正攻击↑', color: 'GOLD' },
        ],
        desc: '我方全员受到的伤害转变为0(1回合)。本场战斗中，自身阴属性增伤提升40，攻击力提升40%'
    },
    {
        id: 'c7',
        relicIds: ['r8', 'r13'],
        badges: [
            { text: '群体回血', color: 'RED' },
            { text: '敌攻击↓', color: 'PURPLE' },
            { text: '敌普攻增伤↓', color: 'PURPLE' },
            { text: '敌技能增伤↓', color: 'PURPLE' },
        ],
        desc: '恢复我方全员50%最大生命。所有敌人的攻击力降低20%，普攻增伤和技能增伤降低20'
    },
    {
        id: 'c8',
        relicIds: ['r11', 'r12', 'r13'],
        badges: [
            { text: '法正回血', color: 'RED' },
            { text: '法正攻击↑', color: 'RED' },
            { text: '法正生命上限↑', color: 'RED' },
            { text: '免疫混乱', color: 'RED' },
            { text: '每回合技能攻击x1', color: 'RED' },
            { text: '⚠️每回合法正-10%血', color: 'GREY' },
        ],
        desc: '恢复自身50%最大生命。本场战斗中，自身攻击力提升200%，最大生命提升200%，免疫【混乱】效果。回合开始时，失去10%当前生命，对敌方全体造成500%攻击力的技能伤害'
    },
];

export {
    GRADES,
    RELICS,
    COMBOS,
}

export type {
    Grade,
    BadgeDef,
    RelicDef,
    ComboDef,
}
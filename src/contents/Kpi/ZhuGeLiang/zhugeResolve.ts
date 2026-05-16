import answerData from './answer.json';

/** 与 zhu_ge_liang.py 中 Color 枚举一致：红=0…紫=4 */
const COLOR_CHAR_VALUE: Record<string, number> = {
    红: 0,
    蓝: 1,
    黄: 2,
    绿: 3,
    紫: 4,
};

export const COLOR_ID_TO_CHAR: Record<string, string> = {
    red: '红',
    blue: '蓝',
    yellow: '黄',
    green: '绿',
    purple: '紫',
};

export type ZhuGeColorId = keyof typeof COLOR_ID_TO_CHAR;

const NS = 120;

interface AnswerPayload {
    P: number[];
    a: (number[] | number)[];
}

function permToBase5Digits(chs: readonly string[]): number {
    let s = 0;
    for (let i = 0; i < 5; i++) {
        const v = COLOR_CHAR_VALUE[chs[i]!];
        if (v === undefined) throw new Error(`无效颜色字: ${chs[i]}`);
        s += v * 5 ** i;
    }
    return s;
}

const { P, a: flatA } = answerData as AnswerPayload;

const encToRank = new Map<number, number>();
for (let i = 0; i < P.length; i++) {
    encToRank.set(P[i]!, i);
}

export function orderToChineseChars(order: readonly string[]): string[] {
    return order.map((id) => {
        const ch = COLOR_ID_TO_CHAR[id as ZhuGeColorId];
        if (!ch) throw new Error(`无效颜色 id: ${id}`);
        return ch;
    });
}

export function rankFromColorOrder(order: readonly string[]): number {
    const chs = orderToChineseChars(order);
    const enc = permToBase5Digits(chs);
    const r = encToRank.get(enc);
    if (r === undefined) throw new Error('颜色排列无法映射到预计算表');
    return r;
}

/** action 码 c = 2*pos + down，down∈{0,1} */
export function actionCodesToBadgeLabels(codes: readonly number[]): string[] {
    return codes.map((code) => {
        const pos = Math.floor(code / 2);
        const isDown = code % 2;
        return `${pos + 1}${isDown === 1 ? '↓' : 'A'}`;
    });
}

export type ZhuGeResolveOutcome =
    | { kind: 'ok'; labels: string[] }
    | { kind: 'no_solution' }
    | { kind: 'bad_table' };

export function resolveZhuGeLabels(sword: readonly string[], ring: readonly string[]): ZhuGeResolveOutcome {
    if (!Array.isArray(P) || P.length !== NS || !Array.isArray(flatA) || flatA.length !== NS * NS) {
        return { kind: 'bad_table' };
    }
    const ra = rankFromColorOrder(sword);
    const rb = rankFromColorOrder(ring);
    const idx = ra * NS + rb;
    const cell = flatA[idx];
    if (cell === -1) return { kind: 'no_solution' };
    if (Array.isArray(cell)) {
        const nums = cell.map((x) => Number(x));
        if (!nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 9)) {
            return { kind: 'bad_table' };
        }
        return { kind: 'ok', labels: actionCodesToBadgeLabels(nums) };
    }
    return { kind: 'bad_table' };
}

import {
    AlertTriangle,
    ArrowRightCircle,
    Lightbulb,
    ShieldCheck,
    Sparkles,
    Swords,
    TrendingUp,
    Zap,
    type LucideIcon
} from 'lucide-react';
import { COMBOS, GRADES, RELICS } from './data';

export interface FaZhengGameState {
    gold: number;
    buffer: string[];
    drawCount: number;
    round: number;
    config: {
        xianYu: boolean;
        firstDraw: boolean;
        stars: '1' | '2+';
    };
}

type RelicDef = (typeof RELICS)[number];

// --- 1. 评分系统配置 ---

// 组合技权重 (参考攻略调整)
const COMBO_WEIGHTS: Record<string, number> = {
    'c8': 9999, // 三红：游戏胜利
    'c6': 900,  // 内经+伞：群体免伤 (保人T0)
    'c3': 850,  // 梳子+眼镜：1000%核弹 (输出T0)
    'c7': 800,  // 文凭+坐骑：回血+削弱 (生存高压T0)
    'c5': 750,  // 梳子+锄头：解控+行动后追打 (长期收益T0 - 越早放越好)
    'c4': 700,  // 钓竿+伞：永久攻击/生命 (长期收益T1 - 越早放越好)
    'c2': 400,  // 药罐+饭碗：每回合回血 (长期收益T2)
};

// 圣物单卡强度评分 (结合攻略调整)
const RELIC_PERFORMANCE: Record<string, number> = {
    // 红色 (核心)
    'r13': 350, // 坐骑(熊猫头)：核心输出。虽然扣血，但按您的策略优先用掉。
    'r12': 200, // 内经(经书)：强力拐，攻略推荐首选
    'r11': 150, // 锄头：高爆发，但有晕眩风险

    // 金色 (功能)
    'r7': 130,  // 梳子：核心输出，百搭王
    'r8': 120,  // 文凭：强力单卡输出+减伤
    'r9': 110,  // 遮阳伞：优质拐，保人必备
    'r10': 100, // 饭碗：群体回血

    // 紫色 (性价比)
    'r4': 90,   // 眼镜：双倍伤害，搭配梳子很强
    'r6': 60,   // 钓竿：面板提升
    'r5': 40,   // 鞋拔子

    // 蓝色
    'r3': 20,
    'r2': 20,
    'r1': 10,
};

// 风险扣分
const RISK_PENALTIES: Record<string, number> = {
    // r11 (锄头): 必须保留扣分，因为没解药就是晕，这是硬伤
    'r11': -100, // 加大惩罚，确保 AI 不会在没解药时乱推荐
    'r12': -20,  // 减防风险
    // r13 (坐骑): 取消扣分，响应"优先用掉"的偏好
};

// 标签系统
const RELIC_TAGS: Record<string, string[]> = {
    'r1': ['DPS'],
    'r2': ['SURVIVAL'],
    'r3': ['BUFF', 'DPS'],
    'r4': ['DPS'],
    'r5': ['DEBUFF', 'DPS'],
    'r6': ['BUFF', 'SURVIVAL'],
    'r7': ['DPS', 'COMBO_CORE'],
    'r8': ['DPS', 'DEBUFF'],
    'r9': ['BUFF', 'SURVIVAL'],
    'r10': ['SURVIVAL'],
    'r11': ['DPS', 'RISK', 'COMBO_CORE'],
    'r12': ['BUFF', 'RISK', 'COMBO_CORE'],
    'r13': ['DPS', 'RISK', 'COMBO_CORE']
};

// 长期收益型组合技 (越早放越好)
const LONG_TERM_COMBOS = ['c4', 'c5', 'c2'];

export interface UIRecommendation {
    action: 'DRAW' | 'SKILL' | 'NEXT';
    title: string;
    reason: string;
    style: 'green' | 'amber' | 'blue' | 'rose';
    Icon: LucideIcon;
}

function evaluateBuffer(buffer: string[]) {
    let score = 0;
    const activeComboIds: string[] = [];
    let dpsCount = 0;
    let buffCount = 0;

    // 1. 单卡价值
    buffer.forEach(id => {
        const perf = RELIC_PERFORMANCE[id] || 0;
        const penalty = RISK_PENALTIES[id] || 0;
        score += (perf + penalty);

        const tags = RELIC_TAGS[id] || [];
        if (tags.includes('DPS')) dpsCount++;
        if (tags.includes('BUFF') || tags.includes('DEBUFF')) buffCount++;
    });

    // 2. 组合技价值
    let hasLongTermBuff = false;
    COMBOS.forEach(c => {
        if (c.relicIds.every(rid => buffer.includes(rid))) {
            activeComboIds.push(c.id);
            score += (COMBO_WEIGHTS[c.id] || 200);
            if (LONG_TERM_COMBOS.includes(c.id)) {
                hasLongTermBuff = true;
                score += 150; // 额外加分，鼓励放出
            }
        }
    });

    // 3. 散件协同 & 幻神检测
    // 检测 "熊猫头+经书+梳子" (r13+r12+r7) - 攻略中提到的幻神组合
    const hasGodTrio = buffer.includes('r13') && buffer.includes('r12') && buffer.includes('r7');
    if (hasGodTrio) {
        score += 1000; // 极高加分
    }

    // 常规协同
    if (dpsCount > 0 && buffCount > 0) {
        score += (dpsCount * buffCount * 30);
    }

    // 4. 危险阻断
    const hasHoe = buffer.includes('r11');
    const hasComb = buffer.includes('r7');
    const hasThreeReds = activeComboIds.includes('c8');

    // 有锄头 && 无梳子 && 无三红 -> 极大负分
    if (hasHoe && !hasComb && !hasThreeReds) {
        score = -9999;
    }

    return { score, activeComboIds, hasHoe, hasComb, hasLongTermBuff, hasGodTrio };
}

export function getFaZhengRecommendation(gameState: FaZhengGameState): UIRecommendation {
    const { gold, buffer, drawCount, config } = gameState;

    // 1. 资金计算 (严格执行下回合2抽策略)
    const baseDrawCost = config.firstDraw ? 2 : 3;
    const currentDrawCost = baseDrawCost + drawCount;
    const poolSize = 13 - buffer.length;

    // 下回合收入
    const nextRoundIncome = config.stars === '2+' ? 9 : 5;
    // 下回合前两抽花费: Draw1(base) + Draw2(base+1)
    const nextRoundTwoDrawsCost = baseDrawCost + (baseDrawCost + 1);
    // 需要保留的储备金 (如果收入够覆盖开销，则为0)
    const reserveGold = Math.max(0, nextRoundTwoDrawsCost - nextRoundIncome);

    // 咸鱼回血计算
    let refund = 0;
    let oldestRelic: RelicDef | null = null;
    if (buffer.length > 0) {
        oldestRelic = RELICS.find(r => r.id === buffer[0]) ?? null;
    }
    if (buffer.length === 3 && config.xianYu && oldestRelic) {
        refund = GRADES[oldestRelic.grade as import('./data').Grade].refund;
    }
    const netCost = Math.max(0, currentDrawCost - refund);

    // 核心判定：是否买得起这一抽，且不影响下回合的2连抽
    const hasSufficientFunds = gold >= (currentDrawCost + reserveGold);

    const currentEval = evaluateBuffer(buffer);

    // =========================================================
    // 优先级 0: 危险阻断 (Anti-Stun)
    // =========================================================
    if (currentEval.score < -5000) {
        // [新增] 即使是为了顶掉锄头，也要看是否动用了下回合的储备金
        const meetsReserve = gold >= (currentDrawCost + reserveGold);

        if (meetsReserve) {
            // 钱够本次消耗 + 下回合储备 -> 抽！
            return {
                action: 'DRAW',
                title: '规避晕眩',
                reason: '持有[锄头]且无[梳子]。资金充足，建议立即抽取寻找解药或挤出锄头。',
                style: 'green',
                Icon: AlertTriangle
            };
        } else {
            // 钱不够储备 -> 忍！(不放技能就不会晕，优先保经济)
            return {
                action: 'NEXT',
                title: '储备优先',
                reason: `持有[锄头]虽有风险，但当前抽取将导致下回合无法2连抽(需留${reserveGold})。建议直接进下回合。`,
                style: 'blue',
                Icon: ArrowRightCircle
            };
        }
    }

    // =========================================================
    // 优先级 1: 终局收割 & 幻神组合
    // =========================================================
    if (currentEval.activeComboIds.includes('c8')) {
        return {
            action: 'SKILL', title: '三红达成', style: 'rose', Icon: Sparkles,
            reason: '已达成最强组合技，毁天灭地，立刻释放！'
        };
    }
    if (currentEval.hasGodTrio) {
        return {
            action: 'SKILL', title: '强力组合', style: 'rose', Icon: Zap,
            reason: '集齐[熊猫头+经书+梳子]，拐力输出兼备，建议直接结算！'
        };
    }

    // =========================================================
    // 优先级 2: 长期收益优先 (Early Game Snowball)
    // =========================================================
    if (currentEval.hasLongTermBuff) {
        const buffNames = currentEval.activeComboIds
            .filter(id => LONG_TERM_COMBOS.includes(id))
            .map(id => {
                if (id === 'c5') return '解控追打(锄头+梳子)';
                if (id === 'c4') return '永久属性(钓竿+伞)';
                if (id === 'c2') return '每回回血(药罐+饭碗)';
                return id;
            }).join('+');

        // 只要不是抽卡极度便宜(<=1)，就建议结算滚雪球
        if (netCost > 1) {
            return {
                action: 'SKILL', title: '铺场增益', style: 'rose', Icon: TrendingUp,
                reason: `激活长期增益[${buffNames}]，越早释放收益越高！`
            };
        }
    }

    // =========================================================
    // 优先级 3: 坐骑(r13) 优先策略 (User Preference)
    // =========================================================
    if (buffer.includes('r13')) {
        // 只要持有坐骑，且总体分数健康(>200)，优先结算
        if (currentEval.score > 200) {
            return {
                action: 'SKILL', title: '单品爆发', style: 'rose', Icon: Swords,
                reason: '持有核心[蚩尤的坐骑]，输出极高。建议优先结算打出伤害。'
            };
        }
    }

    // =========================================================
    // 优先级 4: 保护关键组件 (Red/Gold Protection)
    // =========================================================
    if (buffer.length === 3 && oldestRelic) {
        const isRed = oldestRelic.grade === 'RED';
        const isGold = oldestRelic.grade === 'GOLD';

        // 只要是红/金，且抽卡不是免费的，就保护
        if ((isRed || isGold) && netCost > 0) {
            if (currentEval.score > 150) {
                return {
                    action: 'SKILL', title: '止盈结算', style: 'amber', Icon: ShieldCheck,
                    reason: `抽取将挤掉高阶圣物[${oldestRelic.name}]。当前收益尚可，建议直接结算。`
                };
            } else {
                return {
                    action: 'NEXT', title: '保留核心', style: 'blue', Icon: ArrowRightCircle,
                    reason: `抽取将挤掉[${oldestRelic.name}]。手牌较差，建议下回合再战。`
                };
            }
        }
    }

    // =========================================================
    // 优先级 5: 强力组合/散件判定
    // =========================================================
    // 比如 c3 (梳子+眼镜) 1000%，或者 c6 (免伤)
    if (currentEval.score >= 600) {
        return {
            action: 'SKILL', title: '强力节奏', style: 'rose', Icon: Swords,
            reason: '当前组合强度较高，建议直接结算！'
        };
    }

    // =========================================================
    // 优先级 6: 咸鱼永动机 (XianYu)
    // =========================================================
    // 必须满足储备金要求，或者净赚
    if (config.xianYu && buffer.length === 3 && netCost <= 1 && hasSufficientFunds) {
        return { action: 'DRAW', title: '咸鱼刷分', style: 'green', Icon: Lightbulb, reason: '成本极低，刷更好的圣物。' };
    }

    // =========================================================
    // 优先级 7: 追梦计算 (EV Check with Reserve)
    // =========================================================
    if (gold >= currentDrawCost) {
        let potentialScoreGain = 0;
        let bestTargetName = "";
        const remainingRelics = RELICS.filter(r => !buffer.includes(r.id));

        remainingRelics.forEach(target => {
            const nextBuffer = [...buffer, target.id];
            if (nextBuffer.length > 3) nextBuffer.shift();
            const nextEval = evaluateBuffer(nextBuffer);
            const gain = nextEval.score - currentEval.score;
            if (gain > potentialScoreGain) {
                potentialScoreGain = gain;
                bestTargetName = target.name;
            }
        });

        const expectedValue = potentialScoreGain / (poolSize || 1);
        const baseThreshold = netCost * 15;

        // 核心修改：只有在满足储备金要求时，才建议常规抽取
        if (hasSufficientFunds) {
            // 如果能大幅提升（如出c8），或者期望值不错
            if (expectedValue > baseThreshold || potentialScoreGain > 350) {
                return {
                    action: 'DRAW',
                    title: '建议抽取',
                    style: 'green',
                    Icon: Lightbulb,
                    reason: `期望收益较高(寻${bestTargetName})，且资金充足。`
                };
            }
            // 低费阶段铺场
            if (currentDrawCost <= 3) {
                return {
                    action: 'DRAW', title: '积累资源', style: 'green', Icon: Lightbulb,
                    reason: '低费阶段，扩充圣物池。'
                };
            }
        }
        // 如果买得起这抽，但买了就影响下回合2抽 -> 建议存钱
        else if (gold >= currentDrawCost) {
            return {
                action: 'NEXT', title: '储备资金', style: 'blue', Icon: ArrowRightCircle,
                reason: `当前抽取将导致下回合无法进行2连抽（需保留${reserveGold}金）。建议存钱。`
            };
        }
    } else {
        return { action: 'NEXT', title: '金币不足', style: 'blue', Icon: ArrowRightCircle, reason: '金币不足。' };
    }

    // =========================================================
    // 优先级 8: 兜底
    // =========================================================
    if (currentEval.score > 120 && currentDrawCost > 4) {
        return {
            action: 'SKILL', title: '平稳输出', style: 'amber', Icon: Swords,
            reason: '当前收益尚可且抽卡较贵，建议打出。'
        };
    }

    return { action: 'NEXT', title: '存钱待机', style: 'blue', Icon: ArrowRightCircle, reason: '暂无好操作，存钱。' };
}
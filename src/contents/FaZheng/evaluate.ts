import { AlertTriangle, ArrowRightCircle, Lightbulb, Sparkles, Swords } from 'lucide-react';
import { COMBOS, GRADES, RELICS } from './data';

// --- 1. 评分系统配置 ---

// 组合技权重 (保持不变，组合技依然是核心)
const COMBO_WEIGHTS: Record<string, number> = {
    'c8': 9999, // 三红
    'c6': 800,  // 群体免伤
    'c3': 700,  // 双重核弹
    'c7': 600,  // 强力回复
    'c5': 500,  // 解控爆发
    'c4': 300,  // 面板提升
    'c2': 150,  // 回血
};

// [新增] 圣物单卡强度评分 (基于倍率、功能性打分)
// 相比通用的 Grade 分，这个更精准
const RELIC_PERFORMANCE: Record<string, number> = {
    // 红色 (Base ~100)
    'r13': 300, // 坐骑：500% + 易伤 Debuff
    'r11': 150, // 锄头：4x400%=1600% 极高爆发
    'r12': 110, // 内经：50% 攻击大 Buff

    // 金色 (Base ~60)
    'r7': 90,   // 梳子：3x200%=600% 优秀输出
    'r8': 80,   // 文凭：300% + 减免伤
    'r9': 70,   // 遮阳伞：增伤 Buff
    'r10': 70,  // 饭碗：群体回血+盾 (生存分)

    // 紫色 (Base ~30)
    'r4': 50,   // 眼镜：2x150%=300% 性价比之王
    'r5': 40,   // 鞋拔子：Debuff 工具人
    'r6': 35,   // 钓竿：面板 Buff

    // 蓝色 (Base ~10)
    'r3': 20,   // 护膝：小 Buff + 小伤害
    'r2': 15,   // 药罐：盾
    'r1': 10,   // 马鞭：凑数
};

// 数值越大，代表 AI 会越不喜欢保留这个圣物
const RISK_PENALTIES: Record<string, number> = {
    // r11 (锄头): 虽然有硬逻辑阻断，但这里也给个小惩罚，
    // 使得在同等条件下，AI 更倾向于要把这个"定时炸弹"洗掉
    'r11': -20,

    // r12 (内经): 普攻/技能免伤降低 50
    // 这是一个显著的生存隐患，给予中等惩罚
    'r12': -60,

    // c8 (三红): 虽然扣10%血，但强度太高，不予惩罚
};

// [新增] 圣物定位标签
const RELIC_TAGS: Record<string, string[]> = {
    'r1': ['DPS'],
    'r2': ['SURVIVAL'],
    'r3': ['BUFF', 'DPS'],
    'r4': ['DPS'],         // 核心散件输出
    'r5': ['DEBUFF', 'DPS'],
    'r6': ['BUFF', 'SURVIVAL'],
    'r7': ['DPS'],         // 核心散件输出
    'r8': ['DPS', 'DEBUFF'],
    'r9': ['BUFF'],
    'r10': ['SURVIVAL'],
    'r11': ['DPS', 'RISK'], // 核心核弹
    'r12': ['BUFF', 'RISK'],
    'r13': ['DPS', 'RISK', 'DEBUFF']
};

// 定义推荐结果的 UI 结构
export interface UIRecommendation {
    action: 'DRAW' | 'SKILL' | 'NEXT';
    title: string;
    reason: string;
    style: 'green' | 'amber' | 'blue' | 'rose';
    Icon: typeof Lightbulb;
}

// 辅助：获取 Buffer 的分数 (保持你提供的逻辑)
function evaluateBuffer(buffer: string[]) {
    let score = 0;
    const activeComboIds: string[] = [];

    // 临时统计标签
    let dpsCount = 0;
    let buffCount = 0;
    let survivalCount = 0;

    // 1. 单卡价值累加 (含惩罚计算)
    buffer.forEach(id => {
        // 基础得分 (收益)
        const performanceScore = RELIC_PERFORMANCE[id] || 0;

        // [新增] 风险扣分 (成本)
        const riskPenalty = RISK_PENALTIES[id] || 0;

        // 净得分
        score += (performanceScore + riskPenalty);

        // 统计标签 (保持不变)
        const tags = RELIC_TAGS[id] || [];
        if (tags.includes('DPS')) dpsCount++;
        if (tags.includes('BUFF') || tags.includes('DEBUFF')) buffCount++;
        if (tags.includes('SURVIVAL')) survivalCount++;
    });

    // 2. 组合技价值累加 (保持不变)
    COMBOS.forEach(c => {
        if (c.relicIds.every(rid => buffer.includes(rid))) {
            activeComboIds.push(c.id);
            score += (COMBO_WEIGHTS[c.id] || 200);
        }
    });

    // 3. 散件协同效应 (保持不变)
    if (dpsCount > 0 && buffCount > 0) {
        score += (dpsCount * buffCount * 30);
    }
    if (survivalCount >= 2 && dpsCount === 0) {
        score += 20;
    }

    // 4. 特殊状态检查 & 硬阻断 (保持不变)
    const hasHoe = buffer.includes('r11');
    const hasComb = buffer.includes('r7');
    const hasThreeReds = activeComboIds.includes('c8');

    if (hasHoe && !hasComb && !hasThreeReds) {
        score = -9999;
    }

    return { score, activeComboIds, hasHoe, hasComb, dpsCount };
}

export function getFaZhengRecommendation(gameState: any): UIRecommendation {
    const { gold, buffer, drawCount, config } = gameState;

    // 基础参数计算
    const baseDrawCost = config.firstDraw ? 2 : 3;
    const currentDrawCost = baseDrawCost + drawCount;
    const poolSize = 13 - buffer.length;

    // [新增] 下一回合储备金计算
    // 1. 下回合收入
    const nextRoundIncome = config.stars === '2+' ? 9 : 5;
    // 2. 下回合前两抽的费用：(基础价) + (基础价 + 1)
    const nextRoundTwoDrawsCost = baseDrawCost + (baseDrawCost + 1);
    // 3. 当前需要保留的“保底金” (如果收入够覆盖开销，则为0)
    const minGoldToKeep = Math.max(0, nextRoundTwoDrawsCost - nextRoundIncome);

    // 计算净成本 (咸鱼回血逻辑)
    let refund = 0;
    if (buffer.length === 3 && config.xianYu) {
        const oldestRelic = RELICS.find(r => r.id === buffer[0]);
        if (oldestRelic) refund = GRADES[oldestRelic.grade].refund;
    }
    const netCost = Math.max(0, currentDrawCost - refund);

    const currentEval = evaluateBuffer(buffer);

    // =========================================
    // 优先级 0: 危险阻断 (保持不变)
    // =========================================
    if (currentEval.score < -5000) {
        // 这里不考虑储备金，因为这是救命的操作
        return {
            action: gold >= currentDrawCost ? 'DRAW' : 'NEXT',
            title: '规避晕眩',
            reason: '持有[锄头]且无解药，勿放技能！' + (gold >= currentDrawCost ? "建议抽取顶掉锄头" : "金币不足，进下回合"),
            style: gold >= currentDrawCost ? 'green' : 'amber',
            Icon: AlertTriangle
        };
    }

    // =========================================
    // 优先级 1: 终局收割 (保持不变)
    // =========================================
    if (currentEval.activeComboIds.includes('c8')) {
        return {
            action: 'SKILL',
            title: '三红达成',
            style: 'rose',
            Icon: Sparkles,
            reason: '已达成最强组合技(c8)，立刻释放！'
        };
    }

    // =========================================
    // 优先级 2: 保护关键组件 (保持不变)
    // =========================================
    if (buffer.length === 3) {
        const oldest = RELICS.find(r => r.id === buffer[0]);
        const isRed = oldest?.grade === 'RED';
        const isGold = oldest?.grade === 'GOLD';

        if (isRed || (isGold && netCost > 2)) {
            if (currentEval.score > 150 || isRed) {
                const riskNote = (oldest?.id === 'r13') ? "尽管有副作用，但" : "";
                return {
                    action: 'SKILL',
                    title: '防止踏空',
                    style: 'amber',
                    Icon: Sparkles,
                    reason: `抽取将挤掉红色圣物[${oldest?.name}]。${riskNote}当前收益极高，建议直接结算。`
                };
            } else {
                return {
                    action: 'NEXT',
                    title: '保留红装',
                    style: 'blue',
                    Icon: ArrowRightCircle,
                    reason: `抽取将挤掉[${oldest?.name}]。建议存钱进下回合寻找配合。`
                };
            }
        }
    }

    // =========================================
    // 优先级 3: 高价值判定 (保持不变)
    // =========================================
    if (currentEval.score >= 600) {
        if (netCost > 3) {
            return {
                action: 'SKILL',
                title: '强力攻击',
                style: 'rose',
                Icon: Swords,
                reason: '当前圣物伤害极高，建议结算！'
            };
        }
    }
    if (currentEval.score > 250 && currentEval.dpsCount > 0) {
        if (netCost > 4) {
            return {
                action: 'SKILL',
                title: '强力散搭',
                style: 'rose',
                Icon: Swords,
                reason: '当前圣物单体质量很高，建议放技能。'
            };
        }
    }

    // =========================================
    // 优先级 4: 咸鱼永动机 (保持不变)
    // =========================================
    // 咸鱼刷分通常是净赚或微亏，且机会难得，这里我们允许它动用储备金
    if (config.xianYu && buffer.length === 3 && netCost <= 1 && gold >= currentDrawCost) {
        return { action: 'DRAW', title: '咸鱼刷分', style: 'green', Icon: Lightbulb, reason: '成本极低，建议刷圣物。' };
    }

    // =========================================
    // 优先级 5: [修改] 追梦计算 (加入储备金逻辑)
    // =========================================

    // 核心修改：判断金币是否足够 "当前抽卡 + 储备金"
    // 或者：虽然不够储备金，但当前抽卡是 "必须一搏" 的情况
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

        // 判断是否满足储备金要求
        const meetsReserve = gold >= (currentDrawCost + minGoldToKeep);

        // 特殊情况：如果潜在收益极高 (例如能出 c8 或 c6)，允许打破储备金限制梭哈
        const isAllInWorthy = potentialScoreGain > 800;

        // 分支 A: 满足储备金 OR 值得梭哈 -> 建议抽取
        if (meetsReserve || isAllInWorthy) {
            if (expectedValue > baseThreshold || (potentialScoreGain > 400 && expectedValue > baseThreshold * 0.6)) {
                return {
                    action: 'DRAW',
                    title: isAllInWorthy && !meetsReserve ? '孤注一掷' : '建议抽取',
                    style: 'green',
                    Icon: Lightbulb,
                    reason: isAllInWorthy && !meetsReserve
                        ? `虽然会影响下回合经济，但有机会凑出[${bestTargetName}]，值得博弈！`
                        : `期望收益较高(寻${bestTargetName})，且资金充足。`
                };
            }

            if (currentDrawCost <= 3) {
                return {
                    action: 'DRAW',
                    title: '积累资源',
                    style: 'green',
                    Icon: Lightbulb,
                    reason: '低费阶段，扩充圣物池。'
                };
            }
        }

        // 分支 B: 买得起这一抽，但会影响下回合的2抽 -> 建议存钱
        else if (gold >= currentDrawCost) {
            return {
                action: 'NEXT',
                title: '储备资金',
                style: 'blue',
                Icon: ArrowRightCircle,
                reason: `当前金币${gold}，抽取后将导致下回合无法进行两连抽。建议存钱。`
            };
        }
    } else {
        return { action: 'NEXT', title: '金币不足', style: 'blue', Icon: ArrowRightCircle, reason: '金币不足。' };
    }

    // =========================================
    // 优先级 6: 兜底 (保持不变)
    // =========================================
    if (currentEval.score > 120 && currentDrawCost > 4) {
        return {
            action: 'SKILL',
            title: '平稳输出',
            style: 'amber',
            Icon: Swords,
            reason: '当前散件质量尚可，建议打出伤害。'
        };
    }

    return { action: 'NEXT', title: '存钱待机', style: 'blue', Icon: ArrowRightCircle, reason: '暂无好操作，存钱。' };
}
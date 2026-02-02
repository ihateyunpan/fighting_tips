/* src/pages/Home.tsx */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Level, levels } from '../data/levels';
import { type EventKey, getEventMeta } from '../data/events';

export default function Home() {
    const navigate = useNavigate();

    // === 核心数据处理逻辑 (与 NavBar 保持一致的排序逻辑) ===
    const sortedGroups = useMemo(() => {
        // 1. 分组
        const groups = levels.reduce((acc, curr) => {
            (acc[curr.event] ||= []).push(curr);
            return acc;
        }, {} as Record<string, Level[]>);

        // 2. 排序 Keys (Event ID 倒序)
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const idA = Number(getEventMeta(a).id);
            const idB = Number(getEventMeta(b).id);
            return idB - idA;
        });

        // 3. 构建视图数据
        return sortedKeys.map(key => {
            const meta = getEventMeta(key);
            // 组内 Level 倒序
            const sortedLevels = [...groups[key]].sort((a, b) => Number(b.id) - Number(a.id));

            return {
                key: key as EventKey,
                meta,
                levels: sortedLevels
            };
        });
    }, []);

    return (
        <div className="animate-fade-in space-y-10">
            {/* Hero Header 保持不变... */}
            <header
                className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-gray-900 to-slate-800 text-white shadow-xl">
                <div className="relative z-10 px-8 py-12 md:py-16">
                    <h1 className="text-3xl font-extrabold mb-4">您的关卡小助手</h1>
                    <p className="text-gray-300">收录一些包含复杂表格或计算的关卡的辅助小工具</p>
                </div>
            </header>

            {/* 卡片网格区 */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {sortedGroups.map(({ key, meta, levels }) => (
                    <div
                        key={key}
                        // 需求3: active 为 false 时有特殊样式 (opacity-75 grayscale)
                        className={`
                            bg-white rounded-2xl border transition-all duration-300 flex flex-col h-full overflow-hidden group
                            ${meta.active
                            ? 'border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1'
                            : 'border-gray-200 opacity-75 grayscale bg-gray-50'
                        }
                        `}
                    >
                        {/* 卡片头 */}
                        <div
                            className="px-6 py-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                            <h2 className={`text-lg font-bold ${meta.active ? 'text-gray-800 group-hover:text-indigo-600' : 'text-gray-500'}`}>
                                {meta.name}
                            </h2>
                            {meta.active ? (
                                <span
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                    进行中
                                </span>
                            ) : (
                                <span
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                                    已结束
                                </span>
                            )}
                        </div>

                        {/* 关卡列表 */}
                        <div className="p-6 flex-1 bg-white">
                            <div className="flex flex-wrap gap-2">
                                {levels.map(l => (
                                    <button
                                        key={l.id}
                                        onClick={() => navigate(`/level/${l.id}`)}
                                        className={`
                                            inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium border rounded-lg transition-all shadow-sm
                                            ${meta.active
                                            ? 'text-gray-600 bg-white border-gray-200 hover:bg-gray-900 hover:text-white hover:border-transparent active:scale-95'
                                            : 'text-gray-400 bg-gray-50 border-gray-100 cursor-default hover:bg-gray-100'
                                        }
                                        `}
                                    >
                                        <span className="opacity-60 text-xs mr-1.5 scale-90">{l.level}</span>
                                        {l.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
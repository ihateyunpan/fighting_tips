/* src/components/NavBar.tsx */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type Level, levels } from '../data/levels';
import { type EventKey, getEventMeta } from '../data/events';

export default function Navbar() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // 移动端状态：记录当前展开的 EventKey，如果点击同一个则关闭 (null)
    const [mobileExpandedEvent, setMobileExpandedEvent] = useState<string | null>(null);

    // === 核心数据处理逻辑 ===
    const groupedData = useMemo(() => {
        // 1. 分组
        const groups = levels.reduce((acc, curr) => {
            (acc[curr.event] ||= []).push(curr);
            return acc;
        }, {} as Record<string, Level[]>);

        // 2. 获取所有 Key 并排序 (Event ID 倒序)
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const idA = Number(getEventMeta(a).id);
            const idB = Number(getEventMeta(b).id);
            return idB - idA; // 倒序
        });

        // 3. 构建最终有序列表，同时对组内的 Levels 进行排序 (Level ID 倒序)
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

    // 搜索逻辑保持不变，稍微适配新结构
    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        const lowerTerm = searchTerm.toLowerCase();
        return levels.filter(l => {
            const meta = getEventMeta(l.event);
            return `${meta.name} ${l.level} ${l.name}`.toLowerCase().includes(lowerTerm);
        });
    }, [searchTerm]);

    const handleNavigate = (id: string) => {
        navigate(`/level/${id}`);
        setSearchTerm('');
        setMobileExpandedEvent(null); // 跳转后关闭移动端菜单
    };

    const toggleMobileMenu = (key: string) => {
        setMobileExpandedEvent(prev => prev === key ? null : key);
    };

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/80 backdrop-blur-md">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4">

                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2 flex-shrink-0">
                        <div
                            className="size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                            G
                        </div>
                        <span className="text-xl font-bold tracking-tight text-gray-900 hidden sm:block">
                            关卡小助手
                        </span>
                    </Link>

                    {/* === 桌面端菜单 === */}
                    <div className="hidden md:flex items-center gap-6">
                        {groupedData.map(({ key, meta, levels }) => {
                            // 需求3: 导航栏只显示 active 的 event
                            if (!meta.active) return null;

                            return (
                                <div key={key} className="relative group">
                                    <button
                                        className="py-2 text-sm font-medium text-gray-600 group-hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1">
                                        {meta.name}
                                        <svg
                                            className="size-3 text-gray-400 group-hover:text-indigo-600 transition-transform group-hover:rotate-180"
                                            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                            strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </button>

                                    <div
                                        className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-center">
                                        <div
                                            className="w-56 bg-white rounded-xl shadow-xl border border-gray-100 ring-1 ring-black/5 overflow-hidden p-1">
                                            {levels.map((l) => (
                                                <div
                                                    key={l.id}
                                                    onClick={() => handleNavigate(l.id)}
                                                    className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg cursor-pointer transition-colors"
                                                >
                                                    <span
                                                        className="opacity-50 text-xs mr-2 border border-gray-200 rounded px-1">{l.level}</span>
                                                    {l.name}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 搜索框 (保持原样，略去部分代码以节省篇幅，逻辑未变) */}
                    <div className="flex-1 max-w-xs relative ml-auto md:ml-0">
                        {/* ...搜索框代码同上一版... */}
                        <div className="relative group">
                            <input
                                type="text"
                                placeholder="搜索关卡..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="block w-full px-4 py-2 border border-gray-200 rounded-full bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                            />
                            {/* 搜索结果弹窗 */}
                            {searchTerm && (
                                <div
                                    className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-50 max-h-80 overflow-y-auto">
                                    {searchResults.map(l => (
                                        <div key={l.id} onClick={() => handleNavigate(l.id)}
                                             className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 text-sm">
                                            {getEventMeta(l.event).name} - {l.level} {l.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* === 移动端菜单 (修复点: 点击无反应) === */}
                {/* 需求1: 手机宽度下可交互 */}
                <div className="md:hidden flex flex-col pb-2">
                    {/* 横向滚动的主菜单 */}
                    <div className="flex overflow-x-auto gap-2 no-scrollbar pb-2">
                        {groupedData.map(({ key, meta }) => {
                            // 移动端依然遵循：只显示 active 的 event
                            if (!meta.active) return null;
                            const isActive = mobileExpandedEvent === key;

                            return (
                                <button
                                    key={key}
                                    onClick={() => toggleMobileMenu(key)}
                                    className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full font-medium whitespace-nowrap transition-colors border ${
                                        isActive
                                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                            : 'bg-gray-100 text-gray-600 border-transparent'
                                    }`}
                                >
                                    {meta.name}
                                </button>
                            );
                        })}
                    </div>

                    {/* 移动端二级菜单：展开的关卡列表 */}
                    {mobileExpandedEvent && (
                        <div
                            className="bg-gray-50 rounded-lg p-2 grid grid-cols-2 gap-2 mt-1 animate-fade-in border border-gray-100">
                            {groupedData.find(g => g.key === mobileExpandedEvent)?.levels.map(l => (
                                <button
                                    key={l.id}
                                    onClick={() => handleNavigate(l.id)}
                                    className="text-left px-3 py-2 bg-white rounded border border-gray-200 text-sm text-gray-700 shadow-sm active:bg-gray-100"
                                >
                                    <span className="text-xs text-gray-400 mr-1">{l.level}</span>
                                    {l.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
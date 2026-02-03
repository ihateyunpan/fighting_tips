import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type Level, levels } from '../data/levels';
import { type EventKey, getEventMeta } from '../data/events';

export default function Navbar() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    // 移动端状态
    const [mobileExpandedEvent, setMobileExpandedEvent] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // 新增：控制移动端全屏菜单

    // === 核心数据处理逻辑 ===
    const groupedData = useMemo(() => {
        const groups = levels.reduce((acc, curr) => {
            (acc[curr.event] ||= []).push(curr);
            return acc;
        }, {} as Record<string, Level[]>);

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const idA = Number(getEventMeta(a).id);
            const idB = Number(getEventMeta(b).id);
            return idB - idA;
        });

        return sortedKeys.map(key => {
            const meta = getEventMeta(key);
            const sortedLevels = [...groups[key]].sort((a, b) => Number(b.id) - Number(a.id));
            return { key: key as EventKey, meta, levels: sortedLevels };
        });
    }, []);

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
        setMobileExpandedEvent(null);
        setIsMobileMenuOpen(false); // 跳转后关闭菜单
    };

    const toggleMobileMenu = (key: string) => {
        setMobileExpandedEvent(prev => prev === key ? null : key);
    };

    return (
        <>
            {/* === 桌面端导航栏 (移动端隐藏) === */}
            <nav
                className="hidden md:block sticky top-0 z-50 w-full border-b border-gray-200/80 bg-white/80 backdrop-blur-md">
                <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between gap-4">

                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
                            <div
                                className="size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                G
                            </div>
                            <span className="text-xl font-bold tracking-tight text-gray-900">
                                关卡小助手
                            </span>
                        </Link>

                        {/* 桌面端菜单 */}
                        <div className="flex items-center gap-6">
                            {groupedData.map(({ key, meta, levels }) => {
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
                                                    <div key={l.id} onClick={() => handleNavigate(l.id)}
                                                         className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg cursor-pointer transition-colors">
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

                        {/* 桌面端搜索框 */}
                        <div className="flex-1 max-w-xs relative ml-auto">
                            <div className="relative group">
                                <input
                                    type="text"
                                    placeholder="搜索关卡..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="block w-full px-4 py-2 border border-gray-200 rounded-full bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                />
                                {searchTerm && (
                                    <div
                                        className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-50 max-h-80 overflow-y-auto">
                                        {searchResults.map(l => (
                                            <div key={l.id} onClick={() => handleNavigate(l.id)}
                                                 className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 text-sm">
                                                {getEventMeta(l.event).name} - {l.level} {l.name}
                                            </div>
                                        ))}
                                        {searchResults.length === 0 &&
                                            <div className="p-4 text-center text-gray-400 text-sm">无搜索结果</div>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* === 移动端悬浮球 (FAB) === */}
            <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden fixed bottom-8 right-6 z-40 size-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-600/30 flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all"
                aria-label="打开菜单"
            >
                <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16m-7 6h7"/>
                </svg>
            </button>

            {/* === 移动端全屏菜单 Overlay === */}
            {isMobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 z-50 bg-white/95 backdrop-blur-xl animate-fade-in flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-100">
                        <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2">
                            <div
                                className="size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                G
                            </div>
                            <span className="text-xl font-bold tracking-tight text-gray-900">关卡小助手</span>
                        </Link>
                        <button
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="size-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        {/* Mobile Search */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="搜索关卡..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-5 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-base"
                            />
                            {searchTerm && (
                                <div
                                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 z-10 overflow-hidden">
                                    {searchResults.map(l => (
                                        <div key={l.id} onClick={() => handleNavigate(l.id)}
                                             className="px-5 py-4 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50 last:border-0">
                                            <div className="text-sm font-medium text-gray-900">{l.name}</div>
                                            <div
                                                className="text-xs text-gray-500 mt-0.5">{getEventMeta(l.event).name} • {l.level}</div>
                                        </div>
                                    ))}
                                    {searchResults.length === 0 &&
                                        <div className="p-4 text-center text-gray-400 text-sm">未找到相关关卡</div>}
                                </div>
                            )}
                        </div>

                        {/* Navigation List */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">所有活动</h3>
                            {groupedData.map(({ key, meta, levels }) => {
                                if (!meta.active) return null;
                                const isExpanded = mobileExpandedEvent === key;

                                return (
                                    <div key={key}
                                         className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                        <button
                                            onClick={() => toggleMobileMenu(key)}
                                            className={`w-full flex items-center justify-between p-4 transition-colors ${isExpanded ? 'bg-gray-50' : 'bg-white'}`}
                                        >
                                            <span className="font-bold text-gray-800">{meta.name}</span>
                                            <svg
                                                className={`size-5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                                                fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                      d="M19 9l-7 7-7-7"/>
                                            </svg>
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                                                {levels.map(l => (
                                                    <button
                                                        key={l.id}
                                                        onClick={() => handleNavigate(l.id)}
                                                        className="w-full text-left px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 hover:text-indigo-600 active:bg-gray-100 transition-colors flex items-center"
                                                    >
                                                        <span
                                                            className="size-1.5 rounded-full bg-indigo-400 mr-3"></span>
                                                        <span className="font-medium mr-auto">{l.name}</span>
                                                        <span
                                                            className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{l.level}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/* src/pages/LevelDetail.tsx */
import { Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { levels } from '../data/levels';
import { LevelContent } from '../contents/registry'; // <--- 引入新的组件

export default function LevelDetail() {
    const { id } = useParams<{ id: string }>();
    const levelData = levels.find((l) => l.id === id);

    if (!levelData) {
        return (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900">查无此关卡</h2>
                <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">返回首页</Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <nav className="flex items-center text-sm text-gray-500 mb-6 space-x-2">
                <Link to="/" className="hover:text-indigo-600 transition-colors">首页</Link>
                <span className="text-gray-300">/</span>
                <span className="text-gray-700 font-medium">{levelData.eventName}</span>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-medium truncate">{levelData.name}</span>
            </nav>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-8 py-8 border-b border-gray-100">
                    <div className="flex items-baseline gap-4 mb-2">
                         <span className="px-2.5 py-0.5 rounded text-sm font-semibold bg-indigo-100 text-indigo-700">
                            {levelData.level || 'SP'}
                         </span>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{levelData.name}</h1>
                    </div>
                </div>

                <div className="px-8 py-8">
                    <Suspense fallback={
                        <div className="animate-pulse space-y-4">
                            <div className="h-4 bg-gray-100 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                            <div className="h-32 bg-gray-50 rounded-lg mt-6"></div>
                        </div>
                    }>
                        <div className="prose prose-indigo max-w-none">
                            {/* === 修改点: 直接渲染组件，传入 id === */}
                            <LevelContent id={id || ''}/>
                        </div>
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
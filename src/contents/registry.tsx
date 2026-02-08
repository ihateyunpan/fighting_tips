/* src/contents/registry.tsx */
import { type ComponentType, lazy, type LazyExoticComponent, useRef } from 'react';
import { useLevelContext } from "../components/LevelContext";

// 动态引入组件
const YiZhanGuanTou = lazy(() => import('./YiZhanGuanTou'));
const Relic19_4 = lazy(() => import('./Relic19_4'))

// 404 组件
const NotFound = () => (
    <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        暂无该关卡内容
    </div>
);

// 类型定义
type LazyComponent = LazyExoticComponent<ComponentType<any>> | ComponentType<any>;

// 路由映射表
const contentMap: Record<string, LazyComponent> = {
    '1': YiZhanGuanTou,
    '2': Relic19_4,
};

// ==========================================
export function LevelToolBar() {
    const { actions } = useLevelContext();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasExport = !!actions.onExport;
    const hasImport = !!actions.onImport;

    if (!hasExport && !hasImport) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !actions.onImport) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            actions.onImport?.(content);
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    return (
        <div className="flex gap-2">
            {hasExport && (
                <button
                    onClick={actions.onExport}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-1"
                    title="导出数据" // 鼠标悬停或长按显示提示
                >
                    <span>📤</span>
                    <span className="hidden sm:inline">导出数据</span>
                </button>
            )}
            {hasImport && (
                <>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-1"
                        title="导入数据"
                    >
                        <span>📥</span>
                        <span className="hidden sm:inline">导入数据</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".json"
                        className="hidden"
                    />
                </>
            )}
        </div>
    );
}

// ==========================================
// 修改: LevelContent
// ==========================================
export function LevelContent({ id }: { id: string }) {
    const Component = contentMap[id] || NotFound;
    return <Component/>;
}

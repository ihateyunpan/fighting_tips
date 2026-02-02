/* src/contents/registry.tsx */
import { type ComponentType, lazy, type LazyExoticComponent } from 'react';

// 动态引入组件
const YiZhanGuanTou = lazy(() => import('./YiZhanGuanTou'));

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
};

// === 修改点: 将普通函数 getLevelComponent 改为 React 组件 LevelContent ===
// 这样文件就只导出组件了，符合 Fast Refresh 规则
export function LevelContent({ id }: { id: string }) {
    const Component = contentMap[id] || NotFound;
    return <Component/>;
}
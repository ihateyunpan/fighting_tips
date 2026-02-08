/* src/contents/registry.tsx */
/* src/components/LevelContext.tsx */
import { createContext, useContext, useEffect, useRef } from 'react';

export interface LevelActions {
    onExport?: () => { data: string; filename: string };
    onImport?: (jsonContent: string) => void;
}

interface LevelContextType {
    actions: LevelActions;
    registerActions: (actions: LevelActions) => void;
}

export const LevelContext = createContext<LevelContextType | null>(null);

export function useLevelToolbar(actions: LevelActions) {
    const context = useContext(LevelContext);

    // 1. 使用 ref 保存最新的 actions
    const actionsRef = useRef(actions);

    useEffect(() => {
        actionsRef.current = actions;
    });

    // === 关键修改点 ===
    // 提前解构出 registerActions。
    // 在 LevelProvider 中，registerActions 被 useCallback 包裹，是引用稳定的。
    const registerActions = context?.registerActions;

    useEffect(() => {
        // 如果不在 Provider 内部，直接返回
        if (!registerActions) return;

        const stableActions: LevelActions = {
            // 这里要做一下封装，确保引用稳定
            onExport: actions.onExport
                ? () => actionsRef.current.onExport!()
                : undefined,

            onImport: actions.onImport
                ? (data) => actionsRef.current.onImport?.(data)
                : undefined
        };

        // 注册
        registerActions(stableActions);

        // 清理
        return () => {
            registerActions({});
        };

        // === 关键修改点 ===
        // 依赖项只写 registerActions，而不是 context
        // 这样只有当 actions 的"有无"状态改变，或者 registerActions 函数本身改变时才触发
        // 由于 registerActions 是稳定的，所以不会因为 Provider 的重渲染而触发死循环
    }, [registerActions, !!actions.onExport, !!actions.onImport]);
}


// Hook: 供 ToolBar 使用
export function useLevelContext() {
    const context = useContext(LevelContext);
    if (!context) throw new Error("useLevelContext must be used within LevelProvider");
    return context;
}

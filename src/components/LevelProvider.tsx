/* src/contents/registry.tsx */
import { type ReactNode, useCallback, useState } from 'react';
import { type LevelActions, LevelContext } from "./LevelContext";

export function LevelProvider({ children }: { children: ReactNode }) {
    const [actions, setActions] = useState<LevelActions>({});

    // === 修改点: 使用 useCallback 包裹，防止死循环 ===
    const registerActions = useCallback((newActions: LevelActions) => {
        setActions(newActions);
    }, []);

    return (
        <LevelContext.Provider value={{ actions, registerActions }}>
            {children}
        </LevelContext.Provider>
    );
}

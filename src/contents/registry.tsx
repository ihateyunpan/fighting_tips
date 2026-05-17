/* src/contents/registry.tsx */
import { type ComponentType, lazy, type LazyExoticComponent, useRef, useState } from 'react';
import { useLevelContext } from "../components/LevelContext";
import { ClipboardCopy, ClipboardPaste, Download, FileDown, FileUp, Upload, X } from 'lucide-react';

// 动态引入组件
const YiZhanGuanTou = lazy(() => import('./YiZhanGuanTou'));
const Relic19_4 = lazy(() => import('./Relic19_4'))
const FaZheng = lazy(() => import('./FaZheng'))
const KpiZhuGeLiang = lazy(() => import('./Kpi/ZhuGeLiang/ZhuGeLiang.tsx'));
const KpiXunYou = lazy(() => import('./Kpi/XunYou'));

// 404 组件
const NotFound = () => (
    <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        暂无该关卡内容
    </div>
);

// 类型定义
type LazyComponent = LazyExoticComponent<ComponentType<unknown>> | ComponentType<unknown>;

// 路由映射表
const contentMap: Record<string, LazyComponent> = {
    '1': YiZhanGuanTou,
    '2': Relic19_4,
    '3': KpiZhuGeLiang,
    '4': KpiXunYou,
    '999': FaZheng,
};

// ==========================================
export function LevelToolBar() {
    const { actions } = useLevelContext();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [modalType, setModalType] = useState<'import' | 'export' | null>(null);

    const hasExport = !!actions.onExport;
    const hasImport = !!actions.onImport;

    if (!hasExport && !hasImport) return null;

    // --- 核心逻辑：导出 ---
    const handleDownloadFile = () => {
        if (!actions.onExport) return;
        const { data, filename } = actions.onExport();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setModalType(null);
    };

    const handleCopyToClipboard = async () => {
        if (!actions.onExport) return;
        try {
            const { data } = actions.onExport();
            await navigator.clipboard.writeText(data);
            alert("✅ 数据已复制到剪贴板");
            setModalType(null);
        } catch (err) {
            alert("❌ 复制失败，请手动下载文件");
            console.error(err);
        }
    };

    // --- 核心逻辑：导入 ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !actions.onImport) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            try {
                actions.onImport?.(content);
                setModalType(null);
            } catch {
                alert("导入失败：文件格式错误");
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const handlePasteFromClipboard = async () => {
        if (!actions.onImport) return;
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                alert("剪贴板为空");
                return;
            }
            actions.onImport(text);
            setModalType(null);
        } catch {
            alert("无法读取剪贴板，请尝试使用文件导入");
        }
    };

    return (
        <>
            {/* 工具栏按钮 */}
            <div className="flex gap-2">
                {hasExport && (
                    <button
                        onClick={() => setModalType('export')}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-1.5"
                    >
                        <Upload size={14} className="text-gray-500"/>
                        <span className="hidden sm:inline">导出</span>
                    </button>
                )}
                {hasImport && (
                    <button
                        onClick={() => setModalType('import')}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-1.5"
                    >
                        <Download size={14} className="text-gray-500"/>
                        <span className="hidden sm:inline">导入</span>
                    </button>
                )}
            </div>

            {/* 隐藏的文件 Input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".json"
                className="hidden"
            />

            {/* 通用 Modal 遮罩 */}
            {modalType && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[2px] animate-fade-in"
                    onClick={() => setModalType(null)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl border border-gray-100 w-full max-w-sm overflow-hidden transform transition-all scale-100"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div
                            className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                {modalType === 'export' ? <Upload size={18} className="text-indigo-600"/> :
                                    <Download size={18} className="text-indigo-600"/>}
                                {modalType === 'export' ? '导出数据' : '导入数据'}
                            </h3>
                            <button onClick={() => setModalType(null)}
                                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                                <X size={18}/>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 grid gap-3">
                            {modalType === 'export' ? (
                                <>
                                    <ModalButton
                                        icon={<FileDown size={20}/>}
                                        title="下载为 JSON 文件"
                                        desc="保存到本地，方便长期备份"
                                        onClick={handleDownloadFile}
                                    />
                                    <ModalButton
                                        icon={<ClipboardCopy size={20}/>}
                                        title="复制到剪贴板"
                                        desc="复制文本，方便快速分享"
                                        onClick={handleCopyToClipboard}
                                    />
                                </>
                            ) : (
                                <>
                                    <ModalButton
                                        icon={<FileUp size={20}/>}
                                        title="从文件导入"
                                        desc="选择本地的 .json 备份文件"
                                        onClick={() => fileInputRef.current?.click()}
                                    />
                                    <ModalButton
                                        icon={<ClipboardPaste size={20}/>}
                                        title="从剪贴板粘贴"
                                        desc="读取剪贴板中的 JSON 文本"
                                        onClick={handlePasteFromClipboard}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// 辅助组件：Modal 内部的大按钮
function ModalButton({ icon, title, desc, onClick }: {
    icon: React.ReactNode,
    title: string,
    desc: string,
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all group text-left w-full"
        >
            <div
                className="p-2 bg-gray-100 rounded-lg group-hover:bg-white group-hover:text-indigo-600 text-gray-500 transition-colors">
                {icon}
            </div>
            <div>
                <div className="font-bold text-gray-800 group-hover:text-indigo-700">{title}</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</div>
            </div>
        </button>
    );
}

// ==========================================
// 修改: LevelContent
// ==========================================
export function LevelContent({ id }: { id: string }) {
    const Component = contentMap[id] || NotFound;
    return <Component/>;
}

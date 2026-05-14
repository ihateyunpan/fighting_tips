/* src/App.tsx */
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import Navbar from './components/NavBar';
import Home from './pages/Home';
import LevelDetail from './pages/LevelDetail';

/** file:// 打开本地产物时路径不是 "/"，需用 HashRouter（仅 localfile 构建） */
const Router = import.meta.env.MODE === 'localfile' ? HashRouter : BrowserRouter;

function App() {
    return (
        <Router>
            <div className="min-h-screen flex flex-col">
                {/* 导航栏 */}
                <Navbar/>

                {/* 主内容区域 */}
                <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Routes>
                        <Route path="/" element={<Home/>}/>
                        <Route path="/level/:id" element={<LevelDetail/>}/>
                        <Route path="*" element={
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                <span className="text-4xl font-bold mb-2">404</span>
                                <p>页面不存在</p>
                            </div>
                        }/>
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;
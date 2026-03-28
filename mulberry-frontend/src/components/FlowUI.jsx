/**
 * 视图组件层：控制所有不直接涉及图拓扑状态的悬浮独立 UI
 */
import React, { useState, useEffect } from 'react';
import { fetchPersistentConfig, pushPersistentConfig } from '../hooks/useFlowEngine';

const API_BASE = "http://127.0.0.1:8000/api";

// ====== 桌面应用顶栏组件组合 (时钟 + 设置按钮) ======
export const TopRightTools = ({ onOpenSettings }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);
  
  const timeString = time.toLocaleTimeString('zh-CN', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-3 select-none">
      <div className="bg-white/80 backdrop-blur-md border border-gray-300 shadow-sm rounded px-3 py-1.5 text-gray-700 font-bold tracking-wider pointer-events-none text-sm">
        {timeString}
      </div>
      <div 
        onClick={onOpenSettings}
        title="设置"
        className="bg-white/90 backdrop-blur-md border border-gray-300 shadow-sm hover:bg-gray-100 hover:shadow-md active:scale-95 transition-all cursor-pointer rounded-full p-2 flex items-center justify-center text-gray-700"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
        </svg>
      </div>
    </div>
  );
};

// ====== 置顶全局设置模态层 ======
export const SettingsModal = ({ isOpen, onClose, globalSettingsPath, setGlobalSettingsPath }) => {
  const [path, setPath] = useState(globalSettingsPath);
  const [status, setStatus] = useState("empty"); 

  const verifyAndSavePath = async (currentPath, shouldPush = true) => {
    if (!currentPath.trim()) { 
      setStatus("empty"); 
      if (shouldPush) await pushPersistentConfig(""); 
      return; 
    }
    
    try {
      const res = await fetch(`${API_BASE}/settings/verify_excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath.trim() })
      });
      const data = await res.json();
      setStatus(data.status);

      if (data.status === "valid" && shouldPush) {
        await pushPersistentConfig(currentPath);
      }
    } catch (e) {
      console.error("验证请求失败:", e);
      setStatus("invalid");
    }
  };

  useEffect(() => {
    const initializeConfig = async () => {
      let targetPath = globalSettingsPath;
      if (!globalSettingsPath) {
        const persistentPath = await fetchPersistentConfig();
        if (persistentPath) {
          targetPath = persistentPath;
          setPath(persistentPath);
          setGlobalSettingsPath(persistentPath);
        }
      }
      if (targetPath) {
        verifyAndSavePath(targetPath, false); 
      }
    };
    initializeConfig();
  }, []); 

  const handleBlur = () => {
    setGlobalSettingsPath(path);
    verifyAndSavePath(path, true); 
  };

  if (!isOpen) return null;

  let labelColor = "text-gray-400";
  let inputBorderColor = "border-gray-300 focus:border-blue-400";
  if (status === "valid") {
    labelColor = "text-emerald-500";
    inputBorderColor = "border-emerald-400 focus:border-emerald-500 bg-emerald-50";
  } else if (status === "invalid") {
    labelColor = "text-red-400";
    inputBorderColor = "border-red-400 focus:border-red-500 bg-red-50";
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-500/30 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-xl shadow-2xl w-[32rem] p-8 relative transform scale-100 transition-transform">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <h2 className="text-xl font-extrabold text-gray-800 mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          微框架系统设置
        </h2>
        <div className={`text-sm font-bold mb-2 transition-colors duration-300 ${labelColor}`}>指定角色配置的 .xlsx 文件地址</div>
        <input 
          type="text" value={path} onChange={(e) => setPath(e.target.value)} onBlur={handleBlur}
          placeholder="例如: C:\Users\raven\Desktop\角色配置.xlsx" spellCheck={false}
          className={`w-full outline-none border-2 rounded-lg px-4 py-2 text-gray-700 transition-colors duration-300 ${inputBorderColor}`}
        />
        <p className="text-xs text-gray-400 mt-2">系统底层已搭载智能热固化功能，输入合规且失焦验证转绿后，该记录会主动落盘锁档，防冷启刷新丢失。</p>
      </div>
    </div>
  );
};

// ====== 控制面板组件：接通【保存与重置】功能 ======
// 新增了纵向栅格 Flex-col 控制样式，分为顶部历史干涉区与底部工程维序区
export const UndoRedoPanel = ({ historyStatus, onUndo, onRedo, onSaveClick, onResetClick }) => {
  const canUndo = historyStatus && historyStatus.undo_count > 0;
  const canRedo = historyStatus && historyStatus.redo_count > 0;

  return (
    <div className="absolute top-16 right-4 z-50 flex flex-col gap-3 font-bold text-sm tracking-wide select-none">
      
      {/* 履历操作栈 */}
      <div className="flex gap-2 justify-end">
        <button 
          onClick={canUndo ? onUndo : undefined}
          className={`px-3 py-1.5 rounded-md shadow-sm border transition-colors ${canUndo ? 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200 active:scale-95 cursor-pointer' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
        >
          undo {canUndo ? historyStatus.undo_count : ""}
        </button>
        <button 
          onClick={canRedo ? onRedo : undefined}
          className={`px-3 py-1.5 rounded-md shadow-sm border transition-colors ${canRedo ? 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200 active:scale-95 cursor-pointer' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
        >
          redo {canRedo ? historyStatus.redo_count : ""}
        </button>
      </div>

      {/* 画布工程全局干涉栈 */}
      <div className="flex gap-2 justify-end">
         <button 
          onClick={onSaveClick}
          className="px-3 py-1.5 rounded-md shadow-sm border bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 active:scale-95 cursor-pointer transition-colors"
          title="将当前拓扑覆盖写入至硬盘的 json 中"
        >
          保存
        </button>
        <button 
          onClick={onResetClick}
          className="px-3 py-1.5 rounded-md shadow-sm border bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 active:scale-95 cursor-pointer transition-colors"
          title="退回系统出厂节点阵列（但不会主动抹除硬盘之前的保存）"
        >
          重置
        </button>
      </div>

    </div>
  );
};

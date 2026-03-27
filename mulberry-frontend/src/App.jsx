/**
 * Mulberry 微框架 - 前端主容器
 * 完整集成了系统快捷键、撤销记录连通、右上方工具栏（时钟+设置）、以及 SSE 流式图执行引擎。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { initialNodes, initialEdges } from './InitialElements';
import { RolePromptNode, RoleNode, ContentNode, DebugNode, ButtonNode, EditableEdge } from './CustomElements';
import Sidebar from './Sidebar';

const nodeTypes = { rolePromptNode: RolePromptNode, roleNode: RoleNode, contentNode: ContentNode, debugNode: DebugNode, buttonNode: ButtonNode };
const edgeTypes = { editableEdge: EditableEdge };
const defaultEdgeOptions = { type: 'editableEdge', animated: true, style: { strokeDasharray: '5, 5', stroke: '#555', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#555' } };
const generateUniqueId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// 后端 API 基础地址
const API_BASE = "http://127.0.0.1:8000/api";

// ====== 桌面应用顶栏组件组合 (时钟 + 设置按钮) ======
const TopRightTools = ({ onOpenSettings }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);
  
  const timeString = time.toLocaleTimeString('zh-CN', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-3 select-none">
      {/* 系统时钟，居于设置按钮左侧组合 */}
      <div className="bg-white/80 backdrop-blur-md border border-gray-300 shadow-sm rounded px-3 py-1.5 text-gray-700 font-bold tracking-wider pointer-events-none text-sm">
        {timeString}
      </div>

      {/* SVG 齿轮设置按钮 */}
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
const SettingsModal = ({ isOpen, onClose, globalSettingsPath, setGlobalSettingsPath }) => {
  const [path, setPath] = useState(globalSettingsPath);
  const [status, setStatus] = useState("empty"); 

  const handleBlur = async () => {
    // 抬起笔尖（失焦）时立刻向外部同步路径变量，并发送验证请求给后端
    setGlobalSettingsPath(path);
    if (!path.trim()) {
      setStatus("empty");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/settings/verify_excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.trim() })
      });
      const data = await res.json();
      setStatus(data.status); 
    } catch (e) {
      console.error("验证请求失败:", e);
      setStatus("invalid");
    }
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

        <div className={`text-sm font-bold mb-2 transition-colors duration-300 ${labelColor}`}>
          指定角色配置的 .xlsx 文件地址
        </div>
        
        <input 
          type="text" 
          value={path} 
          onChange={(e) => setPath(e.target.value)} 
          onBlur={handleBlur}
          placeholder="例如: C:\Users\raven\Desktop\角色配置.xlsx"
          spellCheck={false}
          className={`w-full outline-none border-2 rounded-lg px-4 py-2 text-gray-700 transition-colors duration-300 ${inputBorderColor}`}
        />
        <p className="text-xs text-gray-400 mt-2">
          输入文件路径后点击此白板任意空白处（停止编辑），系统将立即底层校验合法性。
        </p>
      </div>
    </div>
  );
};

// ====== 撤销/重做 控制面板组件 ======
const UndoRedoPanel = ({ historyStatus, onUndo, onRedo }) => {
  const canUndo = historyStatus.undo_count > 0;
  const canRedo = historyStatus.redo_count > 0;

  return (
    <div className="absolute top-16 right-4 z-50 flex gap-2 font-bold text-sm tracking-wide select-none">
      <button 
        onClick={canUndo ? onUndo : undefined}
        className={`px-3 py-1.5 rounded-md shadow-sm border transition-colors ${
          canUndo ? 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200 active:scale-95 cursor-pointer' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
        }`}
      >
        undo {canUndo ? historyStatus.undo_count : ""}
      </button>

      <button 
        onClick={canRedo ? onRedo : undefined}
        className={`px-3 py-1.5 rounded-md shadow-sm border transition-colors ${
          canRedo ? 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200 active:scale-95 cursor-pointer' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
        }`}
      >
        redo {canRedo ? historyStatus.redo_count : ""}
      </button>
    </div>
  );
};

// ====== 核心组装面板 ======
const FlowEditor = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();

  const [historyStatus, setHistoryStatus] = useState({ undo_count: 0, redo_count: 0 });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); 
  const [globalSettingsPath, setGlobalSettingsPath] = useState(""); 
  
  const isUndoRedoActionRef = useRef(false);
  const isInitializedRef = useRef(false);
  const historyStatusRef = useRef(historyStatus); 
  const clipboardRef = useRef([]);

  // 用于防并发截断的流式引擎指针
  const isStreamingRef = useRef(false);
  const currentActiveStreamNodeId = useRef(null);

  useEffect(() => { historyStatusRef.current = historyStatus; }, [historyStatus]);

  // --- 历史栈推送接口 ---
  const resetStateInBackend = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/history/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes: getNodes(), edges: getEdges() }) });
      const data = await response.json();
      setHistoryStatus(data);
    } catch (err) { console.warn("重置堆栈失败:", err.message); }
  }, [getNodes, getEdges]);

  const pushStateToBackend = useCallback(async () => {
    if (isUndoRedoActionRef.current || isStreamingRef.current) return; // 流式注入过程中产生的变化锁死，不写入历史栈以免爆内存
    try {
      const response = await fetch(`${API_BASE}/history/push`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes: getNodes(), edges: getEdges() }) });
      const data = await response.json();
      setHistoryStatus(data);
    } catch (err) { console.warn("增加记录写入失败:", err.message); }
  }, [getNodes, getEdges]);

  const handleUndo = useCallback(async () => {
    if (historyStatusRef.current.undo_count <= 0 || isStreamingRef.current) return;
    isUndoRedoActionRef.current = true;
    try {
      const resp = await fetch(`${API_BASE}/history/undo`, { method: 'POST' });
      const data = await resp.json();
      setHistoryStatus(data.status);
      if (data.state) { setNodes(data.state.nodes || []); setEdges(data.state.edges || []); }
    } catch (err) { console.error("撤销请求失败:", err); }
    setTimeout(() => { isUndoRedoActionRef.current = false; }, 100);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(async () => {
    if (historyStatusRef.current.redo_count <= 0 || isStreamingRef.current) return;
    isUndoRedoActionRef.current = true;
    try {
      const resp = await fetch(`${API_BASE}/history/redo`, { method: 'POST' });
      const data = await resp.json();
      setHistoryStatus(data.status);
      if (data.state) { setNodes(data.state.nodes || []); setEdges(data.state.edges || []); }
    } catch (err) { console.error("重做请求失败:", err); }
    setTimeout(() => { isUndoRedoActionRef.current = false; }, 100);
  }, [setNodes, setEdges]);


  // ===================== 核心任务：SSE 流式管线接管 =====================
  const runChatStream = async (buttonNodeId) => {
    if (isStreamingRef.current) return;
    isStreamingRef.current = true;

    try {
      // 通过 /chat/run 将前端整个图拓扑及设置项掷向后端
      const response = await fetch(`${API_BASE}/chat/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          nodes: getNodes(), 
          edges: getEdges(), 
          button_id: buttonNodeId, 
          settings_path: globalSettingsPath 
        })
      });

      if (!response.body) throw new Error("无法读取服务器流态管道");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let pendingBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pendingBuffer += decoder.decode(value, { stream: true });
        // 将流通过 \n\n 截断为独立事件片段
        const payloads = pendingBuffer.split('\n\n');
        pendingBuffer = payloads.pop() || ""; 

        for (const strPayload of payloads) {
          const lines = strPayload.split('\n');
          let eventType = "message";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.substring(6).trim();
            else if (line.startsWith('data:')) eventData = line.substring(5).trim();
          }

          if (eventType === 'meta') {
            const metaInfo = JSON.parse(eventData);
            currentActiveStreamNodeId.current = metaInfo.new_current_id;
            
            // 收到后端推演出的拓扑指令：用户节点退居“历史”，爱丽丝节点升格为“当前”，且内容置空准备承接字雨
            setNodes((nds) => nds.map((node) => {
              if (node.id === metaInfo.old_current_id) return { ...node, data: { ...node.data, status: "历史" } };
              if (node.id === metaInfo.new_current_id) return { ...node, data: { ...node.data, status: "当前", content: "" } };
              return node;
            }));
          } 
          else if (eventType === 'text') {
            const { text } = JSON.parse(eventData);
            // 这里利用增量函数安全规避由于并流带来的 React 闭包问题
            setNodes((nds) => nds.map((node) => {
              if (node.id === currentActiveStreamNodeId.current) {
                return { ...node, data: { ...node.data, content: node.data.content + text } };
              }
              return node;
            }));
          } 
          else if (eventType === 'error') {
            const { msg } = JSON.parse(eventData);
            alert("图执行引擎被拦截: \n\n" + msg);
          }
          else if (eventType === 'done') {
            // 对话执行宣告终结，爱丽丝失去当前标位，退为历史
            setNodes((nds) => nds.map((node) => {
              if (node.id === currentActiveStreamNodeId.current) {
                return { ...node, data: { ...node.data, status: "历史" } };
              }
              return node;
            }));
          }
        }
      }
    } catch (err) {
      console.error("执行大模型流引擎崩坏:", err);
    } finally {
      // 善后：解开所有流式锁定，并在一瞬间将整张画布的变迁作为“1个有效动作”塞入回溯站
      isStreamingRef.current = false;
      currentActiveStreamNodeId.current = null;
      setTimeout(() => pushStateToBackend(), 300);
    }
  };

  // --- 自定义事件：拦截来自 ButtonNode 的启动命令 ---
  useEffect(() => {
    const handleStartChat = (e) => {
      // 抓获点击按钮本身的节点 ID，传递给图执行器便于溯源遍历
      const buttonId = e.detail.nodeId;
      runChatStream(buttonId);
    };
    window.addEventListener('mulberry-start-chat', handleStartChat);
    return () => window.removeEventListener('mulberry-start-chat', handleStartChat);
    // 此处必须依赖 globalSettingsPath，以保障启动时携带着最新的配置数据
  }, [getNodes, getEdges, globalSettingsPath]); 

  // ===================== 快捷键监听机制 =====================
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toUpperCase();
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase(); 

      if (isCtrlOrCmd && key === 'z') { e.preventDefault(); handleUndo(); }
      else if (isCtrlOrCmd && key === 'c') {
        e.preventDefault();
        const activeNodes = getNodes().filter(node => node.selected);
        if (activeNodes.length > 0) clipboardRef.current = JSON.parse(JSON.stringify(activeNodes));
      } else if (isCtrlOrCmd && key === 'v') {
        e.preventDefault();
        if (clipboardRef.current.length === 0) return;
        const newPastedNodes = clipboardRef.current.map(node => ({
          ...node,
          id: generateUniqueId(),
          selected: true,
          position: { x: node.position.x + 30, y: node.position.y + 30 }
        }));
        setNodes((nds) => {
          const deselectOld = nds.map(n => ({ ...n, selected: false }));
          return deselectOld.concat(newPastedNodes);
        });
        setTimeout(() => pushStateToBackend(), 100);
        clipboardRef.current = clipboardRef.current.map(node => ({ ...node, position: { x: node.position.x + 30, y: node.position.y + 30 } }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [getNodes, setNodes, handleUndo, pushStateToBackend]);

  // --- 初始化与常规 UI 动作捕获 ---
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      setTimeout(() => resetStateInBackend(), 200);
    }
    const handleSettled = () => pushStateToBackend();
    window.addEventListener('mulberry-action-settled', handleSettled);
    return () => window.removeEventListener('mulberry-action-settled', handleSettled);
  }, [pushStateToBackend, resetStateInBackend]);

  const onNodeDragStop = useCallback(() => { pushStateToBackend(); }, [pushStateToBackend]);
  const onNodesDelete = useCallback(() => { setTimeout(pushStateToBackend, 50); }, [pushStateToBackend]);
  const onEdgesDelete = useCallback(() => { setTimeout(pushStateToBackend, 50); }, [pushStateToBackend]);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'editableEdge', animated: true, data: { label: "" } }, eds));
    setTimeout(pushStateToBackend, 50);
  }, [setEdges, pushStateToBackend]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const reactFlowData = event.dataTransfer.getData('application/reactflow');
    if (!reactFlowData) return;
    const { type, title } = JSON.parse(reactFlowData);
    if (!type) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const newNodeData = { title };
    if (type === 'rolePromptNode' || type === 'roleNode') { newNodeData.content = "待编辑"; } 
    else if (type === 'contentNode') { newNodeData.content = "待编辑"; newNodeData.status = "待编辑"; }
    
    setNodes((nds) => nds.concat({ id: generateUniqueId(), type, position, data: newNodeData }));
    setTimeout(pushStateToBackend, 50);
  }, [screenToFlowPosition, setNodes, pushStateToBackend]);

  // --- 颜色分配器 ---
  const getMiniMapNodeColor = (node) => {
    switch (node.type) {
      case 'rolePromptNode': case 'roleNode': return '#a3e635'; 
      case 'contentNode': return node.data?.status === '当前' ? '#fbbf24' : '#d1d5db'; 
      case 'debugNode': case 'buttonNode': return '#f59e0b'; 
      default: return '#eeeeee';
    }
  };

  return (
    <div className="w-full h-full relative">
      <TopRightTools onOpenSettings={() => setIsSettingsModalOpen(true)} />
      
      <UndoRedoPanel historyStatus={historyStatus} onUndo={handleUndo} onRedo={handleRedo} />
      
      <SettingsModal 
        isOpen={isSettingsModalOpen} 
        onClose={() => setIsSettingsModalOpen(false)} 
        globalSettingsPath={globalSettingsPath} 
        setGlobalSettingsPath={setGlobalSettingsPath}
      />

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
        onNodeDragStop={onNodeDragStop} 
        onNodesDelete={onNodesDelete}   
        onEdgesDelete={onEdgesDelete}   
        nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={defaultEdgeOptions}
        selectionOnDrag
        fitView 
      >
        <Background gap={16} color="#ccc" />
        <Controls />
        <MiniMap position="bottom-right" pannable zoomable nodeColor={getMiniMapNodeColor} maskColor="rgba(240, 240, 240, 0.7)" className="rounded-lg shadow-lg border bg-white" />
      </ReactFlow>
    </div>
  );
};

export default function App() {
  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#F9F9FB]">
      <ReactFlowProvider>
        <Sidebar />
        <div className="flex-grow h-full"><FlowEditor /></div>
      </ReactFlowProvider>
    </div>
  );
}

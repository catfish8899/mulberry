/**
 * Mulberry 微框架 - 前端主容器（已深度解耦版）
 * 集中管理 React Flow 环境、注册中心与事件绑定系统。
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow, ReactFlowProvider, addEdge, useNodesState, useEdgesState,
  Background, Controls, MiniMap, MarkerType, useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { initialNodes, initialEdges } from './InitialElements';
import { RolePromptNode, RoleNode, ContentNode, DebugNode, ButtonNode, EditableEdge } from './CustomElements';
import Sidebar from './Sidebar';

// 引入被剥离的模块：增加了独立于履历栈之外的新物理通信管线 (fetchCanvasData / pushCanvasData)
import { TopRightTools, SettingsModal, UndoRedoPanel } from './components/FlowUI';
import { useFlowEngine, fetchCanvasData, pushCanvasData } from './hooks/useFlowEngine';

const nodeTypes = { rolePromptNode: RolePromptNode, roleNode: RoleNode, contentNode: ContentNode, debugNode: DebugNode, buttonNode: ButtonNode };
const edgeTypes = { editableEdge: EditableEdge };
const defaultEdgeOptions = { type: 'editableEdge', animated: true, style: { strokeDasharray: '5, 5', stroke: '#555', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#555' } };
const generateUniqueId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// ====== 核心组装面板 ======
const FlowEditor = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); 
  const [globalSettingsPath, setGlobalSettingsPath] = useState(""); 
  
  const isInitializedRef = useRef(false);
  const clipboardRef = useRef([]);

  // 挂载后端通信引擎
  const {
    historyStatus, pushStateToBackend, resetStateInBackend,
    handleUndo, handleRedo, runChatStream
  } = useFlowEngine({ getNodes, getEdges, setNodes, setEdges, globalSettingsPath });

  // --- 自定义事件：拦截来自 ButtonNode 的启动命令 ---
  useEffect(() => {
    const handleStartChat = (e) => runChatStream(e.detail.nodeId);
    window.addEventListener('mulberry-start-chat', handleStartChat);
    return () => window.removeEventListener('mulberry-start-chat', handleStartChat);
  }, [runChatStream]); 

  // ===================== 全局防冲突快捷键监听机制 =====================
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toUpperCase();
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase(); 

      if (isCtrlOrCmd && key === 'z') { 
        e.preventDefault(); 
        handleUndo(); 
      }
      else if (isCtrlOrCmd && key === 'c') {
        e.preventDefault();
        const activeNodes = getNodes().filter(node => node.selected);
        if (activeNodes.length > 0) clipboardRef.current = JSON.parse(JSON.stringify(activeNodes));
      } 
      else if (isCtrlOrCmd && key === 'v') {
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

  // ===================== 数据生命周期系统干涉动作 =====================

  // 1. 初始化引擎启动验证与拉取
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      
      const initializeCanvas = async () => {
        // 利用 Fetch API 从后端调取最后一次被覆盖落盘保存的画布状态
        const savedData = await fetchCanvasData();
        
        // 若存在记录，通过 setNodes 重写状态树进行 UI 级渲染
        if (savedData && savedData.nodes && savedData.nodes.length > 0) {
          setNodes(savedData.nodes);
          setEdges(savedData.edges || []);
        }
        
        // 画布装载就绪，指示后端履历清空，一切重新从此记录点刻录作为起始 Zero-Index
        setTimeout(() => resetStateInBackend(), 200);
      };
      
      initializeCanvas();
    }
    
    // 监听拖拽事件稳定后的记录总账信号
    const handleSettled = () => pushStateToBackend();
    window.addEventListener('mulberry-action-settled', handleSettled);
    return () => window.removeEventListener('mulberry-action-settled', handleSettled);
  }, [pushStateToBackend, resetStateInBackend, setNodes, setEdges]);


  // 2. 将当前运行环境的坐标系进行物理保存落卷
  const handleSaveCanvasCommand = async () => {
    try {
      await pushCanvasData(getNodes(), getEdges());
      alert("✅ 画布拓扑数据已成功持久化封装至系统的本地物理硬盘！");
    } catch (e) {
      // 修复处：显式调用该异常对象以消除严格模式编译器校验报错，并保留排查日志
      console.error("画布保存异常:", e); 
      alert("⚠️ 保存请求失败，可能遭遇挂起截断！");
    }
  };

  // 3. 将 UI 环境彻底清空洗盘，归回代码默认阵列但并不进行任何物理覆写
  const handleResetCanvasCommand = () => {
    if (window.confirm("警告：确定要重置当前工作台吗？\n\n这会将图纸重设为默认出厂状态，但是不会覆盖本地硬盘已被保存的文档。如果你随后没按下“保存”而是选择强制刷新网页，上一个存档依然能回来。")) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      // 清理撤销恢复栈，让其与新的出厂态重新映射，切断历史污染关联
      setTimeout(() => resetStateInBackend(), 200);
    }
  };


  // --- 节点原生事件调度机制 ---
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
      
      {/* 载入并赋予撤销/重做/保存/重置的核心调度控制权 */}
      <UndoRedoPanel 
        historyStatus={historyStatus} 
        onUndo={handleUndo} 
        onRedo={handleRedo} 
        onSaveClick={handleSaveCanvasCommand} 
        onResetClick={handleResetCanvasCommand} 
      />
      
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
        onNodeDragStop={onNodeDragStop} onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}   
        nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={defaultEdgeOptions}
        selectionOnDrag fitView 
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

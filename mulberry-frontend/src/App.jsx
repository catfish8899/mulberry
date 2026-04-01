/**
 * Mulberry 微框架 - 前端主容器（深度架构演进版）
 * 动态父子流归属探测系统、准星感知粘贴防重叠引擎配置。
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow, ReactFlowProvider, addEdge, useNodesState, useEdgesState,
  Background, Controls, MiniMap, MarkerType, useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { initialNodes, initialEdges } from './InitialElements';
import { RolePromptNode, RoleNode, ContentNode, ToolNode, ModelStatusNode, CollectionNode, DebugNode, ButtonNode, EditableEdge } from './CustomElements';
import Sidebar from './Sidebar';

import { TopRightTools, SettingsModal, UndoRedoPanel } from './components/FlowUI';
import { useFlowEngine, fetchCanvasData, pushCanvasData } from './hooks/useFlowEngine';

const nodeTypes = { 
  rolePromptNode: RolePromptNode, roleNode: RoleNode, contentNode: ContentNode, 
  toolNode: ToolNode, modelStatusNode: ModelStatusNode, 
  collectionNode: CollectionNode,
  debugNode: DebugNode, buttonNode: ButtonNode 
};
const edgeTypes = { editableEdge: EditableEdge };
const defaultEdgeOptions = { type: 'editableEdge', animated: true, style: { strokeDasharray: '5, 5', stroke: '#555', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#555' } };
const generateUniqueId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

/**
 * 拓扑排序工具函数：确保父节点（collectionNode）始终排列在其子节点之前。
 * React Flow 引擎强制要求：若子节点的 parentId 指向某父节点，
 * 则父节点必须在节点数组中先于子节点出现，否则父子关系会被静默丢弃。
 */
const sortNodesForParentPriority = (nodesList) => {
  const parentPool = [];
  const childPool = [];
  const freePool = [];

  nodesList.forEach(node => {
    if (node.type === 'collectionNode') {
      parentPool.push(node);
    } else if (node.parentId) {
      childPool.push(node);
    } else {
      freePool.push(node);
    }
  });

  return [...parentPool, ...freePool, ...childPool];
};

/**
 * 获取节点在画布世界坐标系中的真实绝对坐标。
 * 递归向上回溯父节点链，逐层累加本地偏移量，
 * 以规避 React Flow 内部 positionAbsolute 在拖拽帧中可能滞后的问题。
 * @param {Object} node - 目标节点
 * @param {Map} nodeMap - 以节点 id 为键的全量节点索引字典
 * @returns {{ x: number, y: number }} 世界绝对坐标
 */
const getAbsolutePosition = (node, nodeMap) => {
  let absX = node.position.x;
  let absY = node.position.y;
  let currentParentId = node.parentId;

  // 沿父链向上回溯累加，直到抵达无父节点的世界顶层
  while (currentParentId) {
    const parentNode = nodeMap.get(currentParentId);
    if (!parentNode) break;
    absX += parentNode.position.x;
    absY += parentNode.position.y;
    currentParentId = parentNode.parentId;
  }

  return { x: absX, y: absY };
};

const FlowEditor = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); 
  const [globalSettingsPath, setGlobalSettingsPath] = useState(""); 
  
  const isInitializedRef = useRef(false);
  const clipboardRef = useRef([]);

  // ================= 准星热视距引擎 =================
  const mousePosTrackerRef = useRef({ x: 0, y: 0 });
  const pasteOffsetControlRef = useRef({ lastX: 0, lastY: 0, cycle: 0 });
  // ===================================================

  const {
    historyStatus, pushStateToBackend, resetStateInBackend,
    handleUndo, handleRedo, runChatStream
  } = useFlowEngine({ getNodes, getEdges, setNodes, setEdges, globalSettingsPath });

  useEffect(() => {
    const handleStartChat = (e) => runChatStream(e.detail.nodeId);
    window.addEventListener('mulberry-start-chat', handleStartChat);
    return () => window.removeEventListener('mulberry-start-chat', handleStartChat);
  }, [runChatStream]); 

  // ================ 键盘快捷键响应环 ================
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toUpperCase();
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase(); 

      if (isCtrlOrCmd && key === 'z') { 
        e.preventDefault(); handleUndo(); 
      }
      else if (isCtrlOrCmd && key === 'c') {
        e.preventDefault();
        const activeNodes = getNodes().filter(node => node.selected);
        if (activeNodes.length > 0) clipboardRef.current = JSON.parse(JSON.stringify(activeNodes));
      } 
      else if (isCtrlOrCmd && key === 'v') {
        e.preventDefault();
        if (clipboardRef.current.length === 0) return;

        const flowMouseTarget = screenToFlowPosition({ x: mousePosTrackerRef.current.x, y: mousePosTrackerRef.current.y });

        if (Math.abs(flowMouseTarget.x - pasteOffsetControlRef.current.lastX) < 5 && 
            Math.abs(flowMouseTarget.y - pasteOffsetControlRef.current.lastY) < 5) {
            pasteOffsetControlRef.current.cycle += 30;
        } else {
            pasteOffsetControlRef.current.cycle = 0;
        }
        pasteOffsetControlRef.current.lastX = flowMouseTarget.x;
        pasteOffsetControlRef.current.lastY = flowMouseTarget.y;

        const minTopLeftX = Math.min(...clipboardRef.current.map(n => n.position.x));
        const minTopLeftY = Math.min(...clipboardRef.current.map(n => n.position.y));

        const newUidDict = {};
        clipboardRef.current.forEach(n => { newUidDict[n.id] = generateUniqueId(); });

        const newPastedNodes = clipboardRef.current.map(node => {
          const isParentInClipboard = node.parentId && newUidDict[node.parentId];
          
          return {
            ...node,
            id: newUidDict[node.id],
            selected: true,
            parentId: isParentInClipboard ? newUidDict[node.parentId] : undefined,
            position: { 
              x: isParentInClipboard ? node.position.x : node.position.x - minTopLeftX + flowMouseTarget.x + pasteOffsetControlRef.current.cycle, 
              y: isParentInClipboard ? node.position.y : node.position.y - minTopLeftY + flowMouseTarget.y + pasteOffsetControlRef.current.cycle 
            }
          };
        });

        setNodes((nds) => {
          const deselectOld = nds.map(n => ({ ...n, selected: false }));
          return sortNodesForParentPriority(deselectOld.concat(newPastedNodes));
        });
        setTimeout(() => pushStateToBackend(), 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [getNodes, setNodes, handleUndo, pushStateToBackend, screenToFlowPosition]);

  // =============== 初始化及落盘管理 ===============
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      const initializeCanvas = async () => {
        const savedData = await fetchCanvasData();
        if (savedData && savedData.nodes && savedData.nodes.length > 0) {
          setNodes(sortNodesForParentPriority(savedData.nodes));
          setEdges(savedData.edges || []);
        }
        setTimeout(() => resetStateInBackend(), 200);
      };
      initializeCanvas();
    }
    const handleSettled = () => pushStateToBackend();
    window.addEventListener('mulberry-action-settled', handleSettled);
    return () => window.removeEventListener('mulberry-action-settled', handleSettled);
  }, [pushStateToBackend, resetStateInBackend, setNodes, setEdges]);

  const handleSaveCanvasCommand = async () => {
    try { await pushCanvasData(getNodes(), getEdges()); alert("✅ 画布拓扑数据已封装防丢锁档。"); } 
    catch (e) { console.error("保存拒止", e); }
  };
  const handleResetCanvasCommand = () => {
    if (window.confirm("确定重置为出厂平面并清除内存链吗？")) { setNodes(initialNodes); setEdges(initialEdges); setTimeout(() => resetStateInBackend(), 200); }
  };

  // ================= 节点拖拽附庸运算层核心引擎 =================
  const onNodeDragStop = useCallback((event, draggedNode, draggedNodes) => {

    // 构建全量节点索引字典，供手动绝对坐标回溯函数使用
    const allCurrentNodes = getNodes();
    const nodeMap = new Map();
    allCurrentNodes.forEach(n => nodeMap.set(n.id, n));

    const allCollections = allCurrentNodes.filter(n => n.type === 'collectionNode');

    if (allCollections.length === 0) {
      pushStateToBackend();
      return;
    }

    // 从回调参数中构建拖拽节点的实时数据字典
    const draggedIdSet = new Set(draggedNodes.map(dn => dn.id));

    setNodes(currentFlowNodes => {
      let topologyChanged = false;

      // 先用最新流中的数据重建索引（setNodes 闭包中的 currentFlowNodes 是最新帧）
      const latestNodeMap = new Map();
      currentFlowNodes.forEach(n => latestNodeMap.set(n.id, n));

      const nextFrameNodes = currentFlowNodes.map(node => {
        if (!draggedIdSet.has(node.id) || node.type === 'collectionNode') return node;

        // 通过手动递归回溯父链，计算出当前节点在世界坐标系中的真实绝对位置。
        // 这完全绕过了 React Flow 内部可能滞后的 positionAbsolute 缓存。
        const absPos = getAbsolutePosition(node, latestNodeMap);
        const nodeW = node.measured?.width || 120;
        const nodeH = node.measured?.height || 80;
        const centerX = absPos.x + nodeW / 2;
        const centerY = absPos.y + nodeH / 2;

        // 检测中心点是否落入某个范围框
        const targetCollection = [...allCollections].reverse().find(col => {
          const colAbsPos = getAbsolutePosition(col, latestNodeMap);
          const colW = col.measured?.width || col.style?.width || 360;
          const colH = col.measured?.height || col.style?.height || 260;
          return centerX >= colAbsPos.x && centerX <= colAbsPos.x + colW &&
                 centerY >= colAbsPos.y && centerY <= colAbsPos.y + colH;
        });

        if (targetCollection) {
          if (node.parentId === targetCollection.id) {
            // 归属未变，无需操作
            return node;
          }
          // 归属变更：加入新框或从旧框转移到新框
          topologyChanged = true;
          const parentAbsPos = getAbsolutePosition(targetCollection, latestNodeMap);
          return {
            ...node,
            parentId: targetCollection.id,
            expandParent: undefined,
            extent: undefined,
            // 世界绝对坐标 → 相对于新父框左上角的本地坐标
            position: { x: absPos.x - parentAbsPos.x, y: absPos.y - parentAbsPos.y }
          };
        } else if (node.parentId) {
          // 脱离：节点被拖出了所有范围框
          topologyChanged = true;
          return {
            ...node,
            parentId: undefined,
            expandParent: undefined,
            extent: undefined,
            // 手动回溯得到的绝对坐标直接作为脱离后的世界坐标
            position: { x: absPos.x, y: absPos.y }
          };
        }

        return node;
      });

      if (topologyChanged) {
        const sorted = sortNodesForParentPriority(nextFrameNodes);
        setTimeout(() => pushStateToBackend(), 60);
        return sorted;
      }
      return nextFrameNodes;
    });

    pushStateToBackend();
  }, [getNodes, setNodes, pushStateToBackend]);

  const onNodesDelete = useCallback(() => { setTimeout(pushStateToBackend, 50); }, [pushStateToBackend]);
  const onEdgesDelete = useCallback(() => { setTimeout(pushStateToBackend, 50); }, [pushStateToBackend]);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'editableEdge', animated: true, data: { label: "" } }, eds));
    setTimeout(pushStateToBackend, 50);
  }, [setEdges, pushStateToBackend]);

  const onDragOver = useCallback((event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

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
    else if (type === 'toolNode') { 
      newNodeData.content = "请配置工具参数或 API Endpoint"; 
      newNodeData.systemPrompt = "执行该节点时，你必须作为函数调用实体(Function-Calling Agent)，严格依据描述格式化输出指定的 JSON 参数以便挂载外部工具。"; 
    }
    else if (type === 'modelStatusNode') { newNodeData.content = "等待后方引擎调度捕获：\n网络消耗、响应时间以及 Token 开销矩阵信息..."; }

    const newNode = { id: generateUniqueId(), type, position, data: newNodeData };
    
    if (type === 'collectionNode') {
        newNode.style = { width: 360, height: 260 }; 
        newNode.zIndex = -1;
        newNode.data.title = "";
    }

    setNodes((nds) => sortNodesForParentPriority(nds.concat(newNode)));
    setTimeout(pushStateToBackend, 50);
  }, [screenToFlowPosition, setNodes, pushStateToBackend]);

  const getMiniMapNodeColor = (node) => {
    switch (node.type) {
      case 'rolePromptNode': case 'roleNode': return '#a3e635'; 
      case 'contentNode': return node.data?.status === '当前' ? '#fbbf24' : '#d1d5db'; 
      case 'toolNode': return '#e9d5ff'; 
      case 'modelStatusNode': return '#bfdbfe'; 
      case 'collectionNode': return '#e5e7eb';
      case 'debugNode': case 'buttonNode': return '#f59e0b'; 
      default: return '#eeeeee';
    }
  };

  return (
    <div className="w-full h-full relative" onMouseMove={(e) => { mousePosTrackerRef.current = { x: e.clientX, y: e.clientY }; }}>
      <TopRightTools onOpenSettings={() => setIsSettingsModalOpen(true)} />
      
      <UndoRedoPanel 
        historyStatus={historyStatus} 
        onUndo={handleUndo} onRedo={handleRedo} 
        onSaveClick={handleSaveCanvasCommand} onResetClick={handleResetCanvasCommand} 
      />
      
      <SettingsModal 
        isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} 
        globalSettingsPath={globalSettingsPath} setGlobalSettingsPath={setGlobalSettingsPath}
      />

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
        onNodeDragStop={onNodeDragStop} 
        onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}   
        nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={defaultEdgeOptions}
        selectionOnDrag fitView 
      >
        <Background gap={16} color="#ccc" />
        <Controls position="bottom-left" style={{ marginLeft: '260px' }} />
        
        <MiniMap 
          position="bottom-right" pannable zoomable 
          nodeColor={getMiniMapNodeColor} maskColor="rgba(240, 240, 240, 0.7)" 
          className="rounded-lg shadow-lg border border-gray-300 backdrop-blur-md !bg-[rgba(255,255,255,var(--uop,0.70))]" 
        />
      </ReactFlow>
    </div>
  );
};

export default function App() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#F9F9FB]">
      <ReactFlowProvider>
        <div className="absolute top-0 left-0 h-full z-10 pointer-events-auto shadow-2xl">
          <Sidebar />
        </div>
        <div className="absolute inset-0 z-0 w-full h-full">
          <FlowEditor />
        </div>
      </ReactFlowProvider>
    </div>
  );
}

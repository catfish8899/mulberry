/**
 * Mulberry 微框架 - 前端主容器
 * 负责组装自定义节点、连线、背景、控制面板、小地图、侧边工具栏以及系统时钟。
 */

import React, { useState, useEffect, useCallback } from 'react';
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

// 导入 XYFlow 基础样式
import '@xyflow/react/dist/style.css';

// 导入初始数据、自定义组件和侧边栏
import { initialNodes, initialEdges } from './InitialElements';
import { 
  RolePromptNode, 
  RoleNode, 
  ContentNode, 
  DebugNode, 
  ButtonNode, 
  EditableEdge 
} from './CustomElements';
import Sidebar from './Sidebar';

// --- 注册自定义节点和类型 ---
const nodeTypes = {
  rolePromptNode: RolePromptNode,
  roleNode: RoleNode,
  contentNode: ContentNode,
  debugNode: DebugNode,
  buttonNode: ButtonNode,
};

const edgeTypes = {
  editableEdge: EditableEdge,
};

// 全局连线默认配置
const defaultEdgeOptions = {
  type: 'editableEdge',
  animated: true,
  style: { strokeDasharray: '5, 5', stroke: '#555', strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#555',
  },
};

// 辅助函数：生成安全的全局唯一节点ID
const generateUniqueId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// ======================== 新增：系统时钟漂浮组件 ========================
const SystemClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // 每秒刷新一次系统时间
    const timerId = setInterval(() => {
      setTime(new Date());
    }, 1000);
    
    // 卸载组件时清理定时器，防止内存泄漏
    return () => clearInterval(timerId);
  }, []);

  // 格式化时间，利用 Intl.DateTimeFormat 特性达到精准输出，如 "下午9:25:20"
  // 注：zh-CN 地区的 hour12 默认会自动带上 上午/下午 的中文字段
  const timeString = time.toLocaleTimeString('zh-CN', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="absolute top-4 right-4 z-50 bg-white/80 backdrop-blur-md border border-gray-300 shadow-sm rounded px-3 py-1.5 text-gray-700 font-bold tracking-wider pointer-events-none select-none text-sm">
      {timeString}
    </div>
  );
};
// ====================================================================

const FlowEditor = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'editableEdge', animated: true, data: { label: "" } }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowData = event.dataTransfer.getData('application/reactflow');
      if (!reactFlowData) return;

      const parsedData = JSON.parse(reactFlowData);
      const { type, title } = parsedData;

      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeData = { title };
      
      // 【本次修复】：将空白内容全部替换为“待编辑”，保证落地后拥有占据文本域的占位符，从而支持双击操作
      if (type === 'rolePromptNode' || type === 'roleNode') {
        newNodeData.content = "待编辑"; 
      } else if (type === 'contentNode') {
        newNodeData.content = "待编辑"; 
        newNodeData.status = "待编辑"; 
      }

      const newNode = {
        id: generateUniqueId(),
        type,
        position,
        data: newNodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const getMiniMapNodeColor = (node) => {
    switch (node.type) {
      case 'rolePromptNode':
      case 'roleNode': return '#a3e635'; 
      case 'contentNode': return node.data?.status === '当前' ? '#fbbf24' : '#d1d5db'; 
      case 'debugNode':
      case 'buttonNode': return '#f59e0b'; 
      default: return '#eeeeee';
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* 挂载系统时钟到右上角 */}
      <SystemClock />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView 
      >
        <Background gap={16} color="#ccc" />
        <Controls />
        <MiniMap 
          position="bottom-right"
          pannable={true} 
          zoomable={true} 
          nodeColor={getMiniMapNodeColor}
          maskColor="rgba(240, 240, 240, 0.7)"
          className="rounded-lg shadow-lg border border-gray-300 overflow-hidden bg-white"
        />
      </ReactFlow>
    </div>
  );
};

export default function App() {
  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#F9F9FB]">
      <ReactFlowProvider>
        <Sidebar />
        <div className="flex-grow h-full">
          <FlowEditor />
        </div>
      </ReactFlowProvider>
    </div>
  );
}

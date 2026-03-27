import React, { useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MarkerType
} from '@xyflow/react';

// 导入 XYFlow 基础样式
import '@xyflow/react/dist/style.css';

// 导入初始数据和自定义组件
import { initialNodes, initialEdges } from './InitialElements';
import { 
  RolePromptNode, 
  RoleNode, 
  ContentNode, 
  DebugNode, 
  ButtonNode, 
  EditableEdge 
} from './CustomElements';

// --- 注册自定义节点和类型 ---
// 将我们编写的组件映射到 type 标识符上
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

// 全局连线默认配置 (统一设置流动虚线和向右箭头)
const defaultEdgeOptions = {
  type: 'editableEdge',
  animated: true,
  style: { strokeDasharray: '5, 5', stroke: '#555', strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#555',
  },
};

const FlowEditor = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // 连线建立回调
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'editableEdge', animated: true, data: { label: "" } }, eds)),
    [setEdges]
  );

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#F9F9FB' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView // 初始载入时自适应视口，将整个图展示在舞台中央
      >
        <Background gap={16} color="#ccc" />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default function App() {
  // ReactFlowProvider 用于在外层包裹，令自定义节点内部可以使用 useReactFlow Hook 操作状态
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}

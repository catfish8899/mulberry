import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, useReactFlow, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

// === 【新增】触发同步机制的公共辅助函数 ===
// 延时 50ms 是为了确保 React Flow 的内部状态已经完成了 useState 的重渲染更新
const notifyActionSettled = () => {
  setTimeout(() => window.dispatchEvent(new Event('mulberry-action-settled')), 50);
};

const InlineEditableArea = ({ initialText, nodeId, fieldKey, customClasses }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const { setNodes } = useReactFlow();
  const inputRef = useRef(null);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    // 判断内容是否真的改变，减少无效的历史堆叠
    if (text !== initialText) {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) return { ...node, data: { ...node.data, [fieldKey]: text } };
          return node;
        })
      );
      notifyActionSettled(); // 【触发】编辑完成，算作有效操作
    }
  };

  return isEditing ? (
    <textarea
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => e.stopPropagation()}
      className={`nodrag nopan w-full bg-white/70 text-black border-2 border-blue-400 rounded outline-none resize-none px-1 overflow-hidden ${customClasses}`}
      rows={text.split('\n').length || 1}
    />
  ) : (
    <div onDoubleClick={() => setIsEditing(true)} className={`cursor-text whitespace-pre-wrap ${customClasses}`}>
      {text}
    </div>
  );
};

export const RolePromptNode = ({ id, data }) => (
  <div className="bg-lime-400 border-2 border-lime-600 rounded-lg shadow-md w-48 font-sans">
    <Handle type="target" position={Position.Top} className="!bg-gray-600" />
    <div className="p-2 border-b border-lime-600 font-bold text-gray-800">{data.title}</div>
    <div className="p-2 min-h-16 text-sm text-gray-800">
      <InlineEditableArea initialText={data.content} nodeId={id} fieldKey="content" />
    </div>
    <Handle type="source" position={Position.Bottom} className="!bg-gray-600" />
  </div>
);

export const RoleNode = ({ id, data }) => (
  <div className="bg-lime-400 border-2 border-lime-600 rounded-lg shadow-md w-28 font-sans text-center">
    <Handle type="target" position={Position.Top} className="!bg-gray-600" />
    <div className="p-2 border-b border-lime-600 font-bold text-gray-800">{data.title}</div>
    <div className="p-2 font-medium text-gray-800">
      <InlineEditableArea initialText={data.content} nodeId={id} fieldKey="content" customClasses="text-center" />
    </div>
    <Handle type="source" position={Position.Bottom} className="!bg-gray-600" />
  </div>
);

export const ContentNode = ({ id, data }) => {
  const { setNodes } = useReactFlow();
  const STATUS_CYCLE = ["待编辑", "当前", "计划", "历史"];
  
  const handleStatusSwitch = (e) => {
    e.stopPropagation(); 
    const currentIndex = STATUS_CYCLE.indexOf(data.status);
    const nextStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
    
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) return { ...node, data: { ...node.data, status: nextStatus } };
        return node;
      })
    );
    notifyActionSettled(); // 【触发】双击切换状态，算作有效操作
  };

  const isCurrent = data.status === "当前";
  const bgClass = isCurrent ? "bg-amber-400" : "bg-gray-300";
  const borderClass = isCurrent ? "border-amber-600" : "border-gray-500";

  return (
    <div className={`${bgClass} border-2 ${borderClass} rounded-lg shadow-md w-56 font-sans transition-colors duration-300`}>
      <Handle type="target" position={Position.Top} className="!bg-gray-600" />
      <div className={`p-2 border-b ${borderClass} flex justify-between items-center`}>
        <span className="font-bold text-gray-800">{data.title}</span>
        <span 
          onDoubleClick={handleStatusSwitch}
          className="text-xs bg-white/50 border border-gray-400 rounded-md px-2 py-1 cursor-pointer hover:bg-white/80 select-none shadow-sm"
          title="双击切换状态"
        >
          {data.status || "待编辑"}
        </span>
      </div>
      <div className="p-2 min-h-20 text-sm text-gray-800">
        <InlineEditableArea initialText={data.content} nodeId={id} fieldKey="content" />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-600" />
    </div>
  );
};

export const DebugNode = ({ data }) => (
  <div className="bg-amber-500 border-2 border-amber-700 rounded-lg shadow-md font-sans text-center px-4 py-2 text-white font-bold whitespace-pre-wrap">
    <Handle type="target" position={Position.Top} className="!bg-gray-600" />
    {data.title}
    <Handle type="source" position={Position.Bottom} className="!bg-gray-600" />
  </div>
);

export const ButtonNode = ({ id, data }) => (
  // 注意，原先的 hover 和 scale 动画仍然保留，在此按钮上新增 onClick
  <div className="bg-gradient-to-br from-amber-300 to-amber-500 border-2 border-amber-600 rounded-lg shadow-md text-center hover:scale-105 active:scale-95 cursor-pointer transition-transform duration-100">
    <Handle type="target" position={Position.Top} className="!bg-gray-600" />
    <button 
      // 派发事件，并将自己的 id 传送出去，便于主控应用溯源寻边
      onClick={() => window.dispatchEvent(new CustomEvent('mulberry-start-chat', {detail: { nodeId: id }}))}
      className="px-5 py-3 font-bold text-gray-800 bg-transparent border-none outline-none w-full h-full cursor-pointer"
    >
      {data.title}
    </button>
    <Handle type="source" position={Position.Bottom} className="!bg-gray-600" />
  </div>
);

export const EditableEdge = ({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd, data
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { setEdges } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data?.label || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (label !== data?.label) {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === id) return { ...edge, data: { ...edge.data, label } };
          return edge;
        })
      );
      notifyActionSettled(); // 【触发】连线描述修改，算作有效操作
    }
  };

  return (
    <>
      <path id={id} style={style} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }} className="nodrag nopan">
          {isEditing ? (
            <input
              ref={inputRef} value={label} onChange={(e) => setLabel(e.target.value)}
              onBlur={handleBlur} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleBlur(); }}
              className="text-xs border border-gray-400 rounded px-1 w-24 outline-none text-center bg-white"
            />
          ) : (
            <div onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="px-2 py-0.5 rounded-full bg-white/90 border border-gray-300 text-gray-700 text-xs shadow-sm cursor-text hover:bg-gray-100">
              {label || "添加描述"}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

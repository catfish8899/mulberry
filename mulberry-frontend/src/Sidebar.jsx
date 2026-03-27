/**
 * Mulberry 微框架 - 侧边工具栏组件
 * 提供节点模板的可视化列表，并通过 HTML5 Drag and Drop API 发送拖拽数据。
 */
import React from 'react';

export default function Sidebar() {
  // 处理拖拽开始事件，将节点的类型和初始标题作为 JSON 字符串附加到拖拽数据载荷中
  const onDragStart = (event, nodeData) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = 'move';
  };

  // 定义所有节点模板的视觉和数据配置
  // 按照您的要求，边框、背景色必须与实际落地的节点一致；内容块呈现为灰色。
  const templates = [
    { type: 'rolePromptNode', title: '角色提示词', classes: 'bg-lime-400 border-lime-600 text-gray-800' },
    { type: 'roleNode', title: '角色块', classes: 'bg-lime-400 border-lime-600 text-gray-800' },
    { type: 'contentNode', title: '内容块', classes: 'bg-gray-300 border-gray-500 text-gray-800' }, // 灰色的"待编辑"配色
    { type: 'debugNode', title: '调试标记\n开始', classes: 'bg-amber-500 border-amber-700 text-white' },
    { type: 'debugNode', title: '调试标记\n结束', classes: 'bg-amber-500 border-amber-700 text-white' },
    { type: 'buttonNode', title: '开始聊天按钮', classes: 'bg-gradient-to-br from-amber-300 to-amber-500 border-amber-600 text-gray-800' },
  ];

  return (
    <aside className="w-64 h-full bg-white border-r border-gray-300 shadow-[4px_0_15px_rgba(0,0,0,0.05)] flex flex-col z-10 shrink-0">
      {/* 侧边栏整体标题 */}
      <div className="p-4 border-b border-gray-200 font-extrabold text-lg text-gray-700 tracking-wider text-center bg-gray-50/50">
        工具栏
      </div>
      
      {/* 竖向排列的节点模板列表 */}
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        {templates.map((tpl, index) => (
          <div
            key={index}
            // 模板的通用样式：加上2px边框，圆角，以及拖拽时的鼠标指针样式
            className={`border-2 rounded-lg p-3 text-center font-bold cursor-grab active:cursor-grabbing hover:-translate-y-0.5 transition-transform shadow-sm select-none ${tpl.classes}`}
            onDragStart={(e) => onDragStart(e, { type: tpl.type, title: tpl.title })}
            draggable
          >
            {/* 借助 whitespace-pre-wrap 确保 "\n" 能正确分行展示 */}
            <span className="whitespace-pre-wrap block pointer-events-none">{tpl.title}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

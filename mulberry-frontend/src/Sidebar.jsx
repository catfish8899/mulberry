/**
 * Mulberry 微框架 - 侧边工具栏组件
 */
import React from 'react';

export default function Sidebar() {
  const onDragStart = (event, nodeData) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = 'move';
  };

  // 全量映射为任意颜色 RGB 表达式以绑定 var(--nop) 全局不透明变量
  const templates = [
    { type: 'rolePromptNode', title: '角色提示词', classes: 'bg-[rgba(163,230,53,var(--nop,0.85))] backdrop-blur-sm border-lime-600 text-gray-800' },
    { type: 'roleNode', title: '角色块', classes: 'bg-[rgba(163,230,53,var(--nop,0.85))] backdrop-blur-sm border-lime-600 text-gray-800' },
    { type: 'contentNode', title: '内容块', classes: 'bg-[rgba(209,213,219,var(--nop,0.85))] backdrop-blur-sm border-gray-500 text-gray-800' },
    
    // 工具块与模型调用分析节点
    { type: 'toolNode', title: '工具块', classes: 'bg-[rgba(233,213,255,var(--nop,0.85))] backdrop-blur-sm border-[#581c87] text-black' },
    { type: 'modelStatusNode', title: '模型调用情况', classes: 'bg-[rgba(191,219,254,var(--nop,0.85))] backdrop-blur-sm border-[#1e3a8a] text-black' },
    
    // ==========================================
    // 新增：范围集合区拖放节点 (浅灰底盘 + 深边界)
    // ==========================================
    { type: 'collectionNode', title: '集合', classes: 'bg-[rgba(229,231,235,var(--nop,0.85))] backdrop-blur-sm border-gray-600 text-gray-800 border-dashed' },

    { type: 'debugNode', title: '调试标记\n开始', classes: 'bg-[rgba(245,158,11,var(--nop,0.85))] backdrop-blur-sm border-amber-700 text-gray-900' },
    { type: 'debugNode', title: '调试标记\n结束', classes: 'bg-[rgba(245,158,11,var(--nop,0.85))] backdrop-blur-sm border-amber-700 text-gray-900' },
    { type: 'buttonNode', title: '开始聊天按钮', classes: 'bg-gradient-to-br from-[rgba(253,230,138,var(--nop,0.85))] to-[rgba(245,158,11,var(--nop,0.85))] backdrop-blur-sm border-amber-600 text-gray-800' },
  ];

  return (
    // 为工具栏底盘注入上层体系的透明度推演指令 --uop 
    <aside className="w-64 h-full bg-[rgba(255,255,255,var(--uop,0.70))] backdrop-blur-md border-r border-gray-300 shadow-[4px_0_15px_rgba(0,0,0,0.05)] flex flex-col z-10 shrink-0">
      <div className="p-4 border-b border-gray-200 font-extrabold text-lg text-gray-700 tracking-wider text-center bg-[rgba(249,250,251,0.5)]">
        工具栏
      </div>
      
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        {templates.map((tpl, index) => (
          <div
            key={index}
            className={`border-2 rounded-lg p-3 text-center font-bold cursor-grab active:cursor-grabbing hover:-translate-y-0.5 transition-transform shadow-sm select-none ${tpl.classes}`}
            onDragStart={(e) => onDragStart(e, { type: tpl.type, title: tpl.title })}
            draggable
          >
            <span className="whitespace-pre-wrap block pointer-events-none">{tpl.title}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

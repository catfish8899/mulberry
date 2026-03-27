/**
 * 初始的节点和连线数据，用于构建最小可行性概念图。
 * 使用基于引用的坐标系进行排布，重现概念图中的拓扑结构。
 */

// --- 节点数据 (Nodes) ---
export const initialNodes = [
  // 1. 角色提示词节点
  {
    id: "node_prompt_alice",
    type: "rolePromptNode",
    position: { x: 50, y: 300 },
    data: { title: "角色提示词", content: "你的名字是爱丽丝，\n你的特点是\n爱吃披萨 🍕" },
  },
  // 2. 角色块：用户
  {
    id: "node_role_user",
    type: "roleNode",
    position: { x: 280, y: 150 },
    data: { title: "角色块", content: "用户" },
  },
  // 3. 角色块：爱丽丝
  {
    id: "node_role_alice",
    type: "roleNode",
    position: { x: 280, y: 480 },
    data: { title: "角色块", content: "爱丽丝" },
  },
  // 4. 内容块：当前状态
  {
    id: "node_content_current",
    type: "contentNode",
    position: { x: 550, y: 250 },
    data: { 
      title: "内容块", 
      status: "当前", // 初始状态为“当前”
      content: "你的特点是什么？\n（用户输入，等待\n按下开始聊天按钮）" 
    },
  },
  // 5. 内容块：计划状态 (由于处于计划中，应该为灰色)
  {
    id: "node_content_plan",
    type: "contentNode",
    position: { x: 550, y: 500 },
    data: { 
      title: "内容块", 
      status: "计划", 
      content: "（此处是爱丽丝的\n回答区域）" 
    },
  },
  // 6. 调试标记：开始
  {
    id: "node_debug_start",
    type: "debugNode",
    position: { x: 880, y: 50 },
    data: { title: "调试标记\n开始" },
  },
  // 7. 行为按钮：开始聊天
  {
    id: "node_btn_start",
    type: "buttonNode",
    position: { x: 880, y: 320 },
    data: { title: "开始聊天按钮" },
  },
  // 8. 调试标记：结束
  {
    id: "node_debug_end",
    type: "debugNode",
    position: { x: 880, y: 600 },
    data: { title: "调试标记\n结束" },
  }
];

// --- 连线数据 (Edges) ---
export const initialEdges = [
  { id: "e_prompt_to_alice", source: "node_prompt_alice", target: "node_role_alice", animated: true, type: "editableEdge", data: { label: "写入提示词" } },
  { id: "e_user_to_current", source: "node_role_user", target: "node_content_current", animated: true, type: "editableEdge", data: { label: "处理此对话" } },
  { id: "e_alice_to_plan", source: "node_role_alice", target: "node_content_plan", animated: true, type: "editableEdge", data: { label: "处理此对话" } },
  { id: "e_current_to_plan", source: "node_content_current", target: "node_content_plan", animated: true, type: "editableEdge", data: { label: "连接上下文" } },
  { id: "e_debugStart_to_current", source: "node_debug_start", target: "node_content_current", animated: true, type: "editableEdge", data: { label: "此处视为开始" } },
  { id: "e_btnStart_to_current", source: "node_btn_start", target: "node_content_current", animated: true, type: "editableEdge", data: { label: "开始聊天" } },
  { id: "e_plan_to_debugEnd", source: "node_content_plan", target: "node_debug_end", animated: true, type: "editableEdge", data: { label: "此处视为结束" } },
];

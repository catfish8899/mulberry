/**
 * 业务引擎层：封装所有与后端微服务通信的逻辑（撤销/重做栈、SSE 推流器、物理落盘挂载）
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:8000/api";

// ====== 独立服务层提取（供非画布相关的系统级 UI 组件及主线程调用） ======

export const fetchPersistentConfig = async () => {
  try {
    const response = await fetch(`${API_BASE}/settings/config`);
    const data = await response.json();
    return data.path || "";
  } catch (err) {
    console.warn("读取本地持久化角色配置失败, 将回落空态", err);
    return "";
  }
};

export const pushPersistentConfig = async (pathString) => {
  try {
    await fetch(`${API_BASE}/settings/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathString.trim() })
    });
  } catch (err) {
    console.warn("持久化角色配置落盘挂起失败", err);
  }
};

/**
 * 【新增】[拉取动作] 从后端 JSON 按规拉取历史被保存的画布数据 (Nodes, Edges)
 */
export const fetchCanvasData = async () => {
  try {
    const response = await fetch(`${API_BASE}/canvas/data`);
    return await response.json();
  } catch (err) {
    console.warn("拉取前端持久化画布数据失败", err);
    return null;
  }
};

/**
 * 【新增】[推送动作] 将当前的 Nodes 和 Edges 强制物理投递到后端，覆写指定的硬盘 .json 文件
 */
export const pushCanvasData = async (nodes, edges) => {
  try {
    await fetch(`${API_BASE}/canvas/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes, edges })
    });
  } catch (err) {
    console.warn("持久化画布保存请求失败", err);
    throw err;
  }
};


// ====== 以下为原架构包含的画布状态机与流式核心引擎 ======

export const useFlowEngine = ({ getNodes, getEdges, setNodes, setEdges, globalSettingsPath }) => {
  const [historyStatus, setHistoryStatus] = useState({ undo_count: 0, redo_count: 0 });
  const isUndoRedoActionRef = useRef(false);
  const historyStatusRef = useRef(historyStatus);

  const isStreamingRef = useRef(false);
  const currentActiveStreamNodeId = useRef(null);

  useEffect(() => { historyStatusRef.current = historyStatus; }, [historyStatus]);

  const resetStateInBackend = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/history/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodes: getNodes(), edges: getEdges() }) });
      const data = await response.json();
      setHistoryStatus(data);
    } catch (err) { console.warn("重置堆栈失败:", err.message); }
  }, [getNodes, getEdges]);

  const pushStateToBackend = useCallback(async () => {
    if (isUndoRedoActionRef.current || isStreamingRef.current) return;
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

  const runChatStream = async (buttonNodeId) => {
    if (isStreamingRef.current) return;
    isStreamingRef.current = true;

    try {
      const response = await fetch(`${API_BASE}/chat/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: getNodes(), edges: getEdges(), button_id: buttonNodeId, settings_path: globalSettingsPath })
      });

      if (!response.body) throw new Error("无法读取服务器流态管道");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let pendingBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pendingBuffer += decoder.decode(value, { stream: true });
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
            setNodes((nds) => nds.map((node) => {
              if (node.id === metaInfo.old_current_id) return { ...node, data: { ...node.data, status: "历史" } };
              if (node.id === metaInfo.new_current_id) return { ...node, data: { ...node.data, status: "当前", content: "" } };
              return node;
            }));
          } 
          else if (eventType === 'text') {
            const { text } = JSON.parse(eventData);
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
      isStreamingRef.current = false;
      currentActiveStreamNodeId.current = null;
      setTimeout(() => pushStateToBackend(), 300);
    }
  };

  return { historyStatus, pushStateToBackend, resetStateInBackend, handleUndo, handleRedo, runChatStream, isStreamingRef };
};

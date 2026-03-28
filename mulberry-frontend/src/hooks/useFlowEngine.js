/**
 * 业务引擎层：封装所有与后端微服务通信的逻辑（撤销/重做栈、SSE 推流器）
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:8000/api";

export const useFlowEngine = ({ getNodes, getEdges, setNodes, setEdges, globalSettingsPath }) => {
  const [historyStatus, setHistoryStatus] = useState({ undo_count: 0, redo_count: 0 });
  const isUndoRedoActionRef = useRef(false);
  const historyStatusRef = useRef(historyStatus);

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

  // ===================== 核心任务：SSE 流式管线接管 =====================
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

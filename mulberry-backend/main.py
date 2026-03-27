# mulberry-backend/main.py
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
import os
import json
import httpx
import logging

# 去除部分第三方库的啰嗦日志
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Mulberry Micro-framework API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====== 历史记录栈 (保持不变) ======
history_stack: List[Dict[str, Any]] = []
current_index: int = -1

def get_current_status():
    return {"undo_count": max(0, current_index), "redo_count": max(0, len(history_stack) - 1 - current_index)}

@app.post("/api/history/reset")
async def reset_state(data: Dict[str, Any]):
    global history_stack, current_index
    history_stack = [data]
    current_index = 0
    return get_current_status()

@app.post("/api/history/push")
async def push_state(data: Dict[str, Any]):
    global history_stack, current_index
    if 0 <= current_index < len(history_stack) - 1:
        history_stack = history_stack[:current_index + 1]
    history_stack.append(data)
    current_index += 1
    return get_current_status()

@app.post("/api/history/undo")
async def undo_state():
    global current_index
    if current_index > 0: current_index -= 1
    return {"state": history_stack[current_index] if history_stack else None, "status": get_current_status()}

@app.post("/api/history/redo")
async def redo_state():
    global current_index
    if current_index < len(history_stack) - 1: current_index += 1
    return {"state": history_stack[current_index] if history_stack else None, "status": get_current_status()}


# ====== 设置与校验 (保持不变) ======
@app.post("/api/settings/verify_excel")
async def verify_excel(payload: Dict[str, Any]):
    path = payload.get("path", "").strip()
    if not path: return {"status": "empty"}
    if not path.lower().endswith('.xlsx'): return {"status": "invalid"}
    if not os.path.exists(path): return {"status": "invalid"}
    try:
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheet = wb.active
        headers = [str(cell).strip() for cell in next(sheet.iter_rows(min_row=1, max_row=1, values_only=True)) if cell is not None]
        expected = ["角色名称", "调用的模型供应商", "调用的模型名称", "环境变量存储层级", "环境变量变量名"]
        if all(e in headers for e in expected): return {"status": "valid"}
        else: return {"status": "invalid"}
    except Exception:
        return {"status": "invalid"}

# ===================== 新增：流式运行时执行图引擎 =====================

def find_node(nodes, node_id):
    """辅助算法：根据 ID 在游离拓扑字典中抓取节点"""
    return next((n for n in nodes if n['id'] == node_id), None)

async def _chat_generator(payload: Dict[str, Any]):
    """
    这是一个遵循 Server-Sent Events (SSE) 协议的异步生成器。
    它不仅负责调用 LLM 流，还在事件元数据中下发指令指导前端更改节点状态。
    """
    try:
        nodes = payload.get("nodes", [])
        edges = payload.get("edges", [])
        btn_id = payload.get("button_id")
        settings_path = payload.get("settings_path")

        # 1. 溯源起点：找到连向该“开始聊天按钮”的内容块
        btn_in_edge = next((e for e in edges if e.get('target') == btn_id), None)
        if not btn_in_edge: raise ValueError("按钮缺失上游连线")
        
        current_content_node = find_node(nodes, btn_in_edge['source'])
        if current_content_node.get('data', {}).get('status') != '当前':
            raise ValueError("防呆拦截：当前上下文焦点状态并非处于『当前』")

        # 2. 预测未来：寻找当前流即将到达的下一个“计划”内容块
        # 往往通过“连接上下文”连线连接
        plan_edge = next((e for e in edges if e.get('source') == current_content_node['id'] and 'connect' not in e.get('type','')), None)
        # 用鸭子类型模糊寻找
        plan_edge = next((e for e in edges if e['source'] == current_content_node['id'] and find_node(nodes, e['target'])['type'] == 'contentNode'), None)
        if not plan_edge: raise ValueError("图有断层，找不到后续的计划接替节点")
        next_content_node = find_node(nodes, plan_edge['target'])

        # 3. 确定角色分布图纸：
        # 寻找目前内容块背后的发言人：
        curr_role_edge = next((e for e in edges if e['target'] == current_content_node['id'] and find_node(nodes, e['source'])['type'] == 'roleNode'), None)
        curr_role_name = find_node(nodes, curr_role_edge['source'])['data']['content'].strip()

        # 寻找接替发言的 Agent 角色：
        next_role_edge = next((e for e in edges if e['target'] == next_content_node['id'] and find_node(nodes, e['source'])['type'] == 'roleNode'), None)
        agent_role_node = find_node(nodes, next_role_edge['source'])
        agent_name = agent_role_node['data']['content'].strip()

        # 寻找系统提示词：
        sys_prompt_edge = next((e for e in edges if e['target'] == agent_role_node['id'] and find_node(nodes, e['source'])['type'] == 'rolePromptNode'), None)
        sys_prompt = find_node(nodes, sys_prompt_edge['source'])['data']['content'] if sys_prompt_edge else ""

        # 第一步通知大捷：向前端发送 Meta 事件，指挥前端立刻将“老内容块”标为历史，将“新内容块”标为当前
        meta_event = {
            "old_current_id": current_content_node['id'],
            "new_current_id": next_content_node['id']
        }
        yield f"event: meta\ndata: {json.dumps(meta_event)}\n\n"

        # 4. 解析 Excel 配置并尝试加载大语言模型环境变量
        api_key, model_name, provider = None, None, None
        model_found_flag = False
        
        if settings_path and os.path.exists(settings_path):
            import openpyxl
            wb = openpyxl.load_workbook(settings_path, read_only=True, data_only=True)
            sheet = wb.active
            for row in sheet.iter_rows(min_row=2, values_only=True):
                # 如果第一列角色名吻合（忽略“用户”）
                if str(row[0]).strip() == agent_name and agent_name != "用户":
                    provider = str(row[1]).strip()
                    model_name = str(row[2]).strip()
                    env_name = str(row[4]).strip() # OS环境存储的变量名
                    api_key = os.getenv(env_name)
                    if api_key: model_found_flag = True
                    break

        # 5. 上下文组装
        user_input_text = current_content_node['data']['content']
        messages = []
        if sys_prompt: messages.append({"role": "system", "content": sys_prompt})
        messages.append({"role": "user", "content": f"{curr_role_name}：{user_input_text}"})

        # 6. 利用 httpx 发起模型流式请求
        # 微框架为了保障没有真实 API 也能容错展示流特性，特设了一道本地 Mock 机制兜底
        if model_found_flag and provider.lower() in ['deepseek', 'openai']:
            base_url = "https://api.deepseek.com/chat/completions" if provider.lower() == 'deepseek' else "https://api.openai.com/v1/chat/completions"
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST", base_url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": model_name, "messages": messages, "stream": True},
                    timeout=30.0
                ) as response:
                    async for chunk in response.aiter_lines():
                        if chunk.startswith("data: ") and chunk != "data: [DONE]":
                            try:
                                data_dict = json.loads(chunk[6:])
                                delta = data_dict["choices"][0]["delta"].get("content", "")
                                if delta:
                                    # 推送每一个字符（Tokens）
                                    yield f"event: text\ndata: {json.dumps({'text': delta})}\n\n"
                            except Exception: pass
        else:
            # 【本地退化演示流】如果环境变量未找到，生成一段框架提示说明以演示打字机效果
            fallback_text = f"你好，这里是本地演练流。我是角色『{agent_name}』。\n您的表格配置 { '成功命中角色' if provider else '没有命中相关角色' }，但由于系统未找到此 API 请求密钥变量，已退回本地演示模式。\n\n看到了吗？这也是流式输出的一环！顺便，你的话“{user_input_text.strip()[:10]}...”收到了。"
            import asyncio
            for char in fallback_text:
                yield f"event: text\ndata: {json.dumps({'text': char})}\n\n"
                await asyncio.sleep(0.05)

        # 第三步指令：发送最终闭合事件，要求前端将当前 Agent 块褪为“历史”
        yield "event: done\ndata: {}\n\n"

    except Exception as e:
        # 如果图结构连错，抛出红色错误提示进入流端
        yield f"event: error\ndata: {json.dumps({'msg': str(e)})}\n\n"

@app.post("/api/chat/run")
async def run_chat(request: Request):
    payload = await request.json()
    # 采用标准 SSE 媒体类型下发流式数据
    return StreamingResponse(_chat_generator(payload), media_type="text/event-stream")

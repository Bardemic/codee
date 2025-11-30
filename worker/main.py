from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Request
import json
import asyncio
from fastapi.responses import StreamingResponse
import redis.asyncio as redis
from tasks.run_repo import pipeline, process_agent_message
from contextlib import asynccontextmanager

REDIS_URL = "redis://localhost:6379/2"

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        yield
    finally:
        await app.state.redis.close()

app = FastAPI(lifespan=lifespan)

origins = ["*"]

app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True)

def sse_pack(event: str, data: dict, id: str | None = None) -> bytes:
    lines = []
    if id:
        lines.append(f"id: {id}")
    if event:
        lines.append(f"event: {event}")
    payload = json.dumps(data, ensure_ascii=False)
    lines.append(f"data: {payload}")
    return ("\n".join(lines) + "\n\n").encode("utf-8")

@app.get("/stream/agent/{agent_id}")
async def stream(agent_id: str, request: Request, last_event_id: str | None = None):
    r: redis.Redis = app.state.redis
    stream_key = f"stream:agent:{agent_id}"

    header_last_id = request.headers.get("Last-Event-ID")
    start_id = header_last_id or last_event_id or "0-0"

    async def event_generator():
        nonlocal start_id
        seen_done = False
        try:
            while not seen_done:
                if await request.is_disconnected():
                    break

                response = await r.xread({stream_key: start_id}, block=30000, count=100)
                if not response:
                    continue
            
                for _key, messages in response:
                    for mid, fields in messages:
                        start_id = mid
                        event = fields.get("event", "message")
                        data = {key: val for key, val in fields.items() if key != "event"}
                        yield sse_pack(event, data, id=mid)
                        if event == "done":
                            seen_done = True
                            break
        except asyncio.CancelledError:
            return
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@app.get('/')
async def root():
    return {
        "message": "codee"
    }

@app.post("/newAgent")
async def newAgent(agent_info: dict):
    tool_slugs = agent_info.get("tool_slugs") or []
    task = pipeline.delay(
        agent_info["repository_full_name"],
        agent_info["prompt"],
        agent_info["agent_id"],
        tool_slugs,
    )
    return {"task_id": task.id, "status": "queued"}


@app.post("/newMessage")
async def newMessage(agent_info: dict):
    tool_slugs = agent_info.get("tool_slugs") or []
    task = process_agent_message.delay(
        agent_info["prompt"],
        agent_info["agent_id"],
        agent_info["previous_messages"],
        tool_slugs,
    )
    return {"task_id": task.id, "status": "queued"}
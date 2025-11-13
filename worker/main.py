from fastapi import FastAPI
from tasks.run_repo import pipeline

app = FastAPI()

@app.get('/')
async def root():
    return {
        "message": "codee"
    }

@app.post("/execute")
async def execute(workspace_info: dict):
    workspace = pipeline.delay(workspace_info["repository_full_name"], workspace_info["prompt"], workspace_info["workspace_id"])
    return {"workspace_id": workspace.id, "status": "queued"}
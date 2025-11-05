import subprocess
from fastapi import FastAPI
from pydantic import BaseModel
import subprocess, tempfile, os

app = FastAPI()

@app.get('/')
async def root():
    return {
        "message": "codee"
    }


class runRequest(BaseModel):
    language: str
    command: str

@app.post('/run')
async def run(req: runRequest):
    print(req.language, req.command)
    with tempfile.TemporaryDirectory() as workdir:
        image = "python:3.11-slim"
        cmd = [
            "docker", "run", "--rm",
            "--cpus=1", "--memory=512m", "--network=none",
            "-v", f"{workdir}:/workspace",
            "-w", "/workspace",
            image, "bash", "-c", req.command
        ]
        try:
            out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout = 30)
            return {"output": out}
        except subprocess.CalledProcessError as e:
            return{"error": e.output.decode()   }
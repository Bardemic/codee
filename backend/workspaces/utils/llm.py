from pydantic import BaseModel, Field
from langchain.chat_models import init_chat_model

def generateTitle(prompt: str) -> str:
    class Title(BaseModel):
        """The title for the user's workspace."""
        title: str = Field(..., description="The title of the workspace.")
    
    model = init_chat_model("gpt-5-nano", model_kwargs={"reasoning_effort": "low"})
    structured_model = model.with_structured_output(Title)
    try:
        response = structured_model.invoke(f"You are a part of Codee, an asynchronous coding agent. Your job is to generate a title based off of the user's request. The title is for the workspace. Aim to be under 7 words. The user's message is: {prompt}")
        if response.title: return response.title
    except:
        pass
    return "Default Title"
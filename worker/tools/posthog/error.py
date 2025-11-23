from . import get_toolkit

toolkit = get_toolkit()

async def get_error_tools():
    names = ["error-details", "list-errors"]
    tools = await toolkit.get_tools()
    error_tools = [tool for tool in tools if tool.name in names]
    return error_tools
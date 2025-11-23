from . import get_toolkit

toolkit = get_toolkit()

async def get_tools():
    names = ["query-run", "query-generate-hogql-from-question", "docs-search"]
    tools = await toolkit.get_tools()
    query_tools = [tool for tool in tools if tool.name in names]
    return query_tools
from . import get_toolkit

toolkit = get_toolkit()

async def get_tools():
    names = [
        "insight-create-from-query",
        "insight-delete",
        "insight-get",
        "insight-query",
        "insight-update",
        "insights-get-all",
        "query-generate-hogql-from-question",
        "query-run"
    ]
    tools = await toolkit.get_tools()
    insights = [tool for tool in tools if tool.name in names]
    return insights
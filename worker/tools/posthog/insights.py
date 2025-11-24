from . import get_toolkit

toolkit = get_toolkit()

prompt = """
<posthog/insights>

An assortment of tools used to access insights from PostHog.
Also able to generate queries from prompts and run those queries on PostHog.
PostHog uses a special language to query the database, so if you want to run a prompt,
you use the generate hogQL before utilizing the hogQL in order to generate proper queries.

tools: 
[
    "insight-create-from-query",
    "insight-delete",
    "insight-get",
    "insight-query",
    "insight-update",
    "insights-get-all",
    "query-generate-hogql-from-question",
    "query-run"
]
</posthog/insights>
"""

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
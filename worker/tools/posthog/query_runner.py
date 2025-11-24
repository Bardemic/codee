from . import get_toolkit

toolkit = get_toolkit()

prompt = """
<posthog/query_runner>

Tools for running queries and searching PostHog documentation.
Generate HogQL queries from natural language questions and execute them.
Search PostHog documentation for help and guidance.

tools: 
[
    "query-run",
    "query-generate-hogql-from-question",
    "docs-search"
]
</posthog/query_runner>
"""

async def get_tools():
    names = ["query-run", "query-generate-hogql-from-question", "docs-search"]
    tools = await toolkit.get_tools()
    query_tools = [tool for tool in tools if tool.name in names]
    return query_tools
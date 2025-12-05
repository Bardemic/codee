from . import get_toolkit

prompt = """
<posthog/documentation>

Tools for searching PostHog documentation.
Find help, guides, and API references from the official PostHog docs.

tools: 
[
    "docs-search"
]
</posthog/documentation>
"""

async def get_tools(agent_id: int):
    toolkit = get_toolkit(agent_id)
    names = ["docs-search"]
    tools = await toolkit.get_tools()
    doc_tools = [tool for tool in tools if tool.name in names]
    return doc_tools

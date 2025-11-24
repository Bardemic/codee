from . import get_toolkit

toolkit = get_toolkit()

prompt = """
<posthog/error>

Tools for accessing and analyzing error data from PostHog.
View error details and list all errors captured in your PostHog project.

tools: 
[
    "error-details",
    "list-errors"
]
</posthog/error>
"""

async def get_tools():
    names = ["error-details", "list-errors"]
    tools = await toolkit.get_tools()
    error_tools = [tool for tool in tools if tool.name in names]
    return error_tools
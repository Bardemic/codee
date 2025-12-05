import httpx
from posthog_agent_toolkit.integrations.langchain.toolkit import PostHogAgentToolkit

_toolkit_cache = {}

def get_posthog_key(agent_id: int) -> str:
    r = httpx.get(f"http://127.0.0.1:5001/api/internals/agents/{agent_id}/posthog-key/")
    return r.json()["api_key"]

def get_toolkit(agent_id: int):
    if agent_id in _toolkit_cache:
        return _toolkit_cache[agent_id]
    api_key = get_posthog_key(agent_id)
    toolkit = PostHogAgentToolkit(personal_api_key=api_key)
    _toolkit_cache[agent_id] = toolkit
    return toolkit

#   dashboard-create
#   dashboard-delete
#   dashboard-get
#   dashboards-get-all
#   dashboard-update
#   docs-search
#   error-details
#   list-errors
#   create-feature-flag
#   delete-feature-flag
#   feature-flag-get-all
#   feature-flag-get-definition
#   update-feature-flag
#   experiment-get-all
#   experiment-create
#   experiment-delete
#   experiment-update
#   experiment-get
#   experiment-results-get
#   insight-create-from-query
#   insight-delete
#   insight-get
#   insight-query
#   insights-get-all
#   insight-update
#   query-run
#   query-generate-hogql-from-question
#   get-llm-total-costs-for-project
#   organization-details-get
#   organizations-get
#   switch-organization
#   projects-get
#   event-definitions-list
#   properties-list
#   switch-project
#   survey-create
#   survey-get
#   surveys-get-all
#   survey-update
#   survey-delete
#   surveys-global-stats
#   survey-stats
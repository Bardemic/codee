import os
from functools import lru_cache
from posthog_agent_toolkit.integrations.langchain.toolkit import PostHogAgentToolkit


@lru_cache(maxsize=1)
def get_toolkit():
    return PostHogAgentToolkit(
        personal_api_key=os.environ["POSTHOG_PERSONAL_API_KEY"],
    )

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
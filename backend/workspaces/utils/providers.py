from rest_framework.exceptions import APIException
from ..cloud_providers import get_provider_class


def create_agents_from_providers(user, workspace, repository_full_name, message, tool_slugs, cloud_providers):
    first = None
    for provider_config in cloud_providers:
        provider_name = provider_config["name"]
        ProviderClass = get_provider_class(provider_name)
        
        if ProviderClass:
            provider = ProviderClass()
            for agent_config in provider_config["agents"]:
                agent = provider.create_agent(
                    user=user,
                    workspace=workspace,
                    repository_full_name=repository_full_name,
                    message=message,
                    tool_slugs=tool_slugs,
                    model=agent_config.get("model")
                )
                if not first and agent:
                    first = agent
    if not first:
        raise APIException("worker issue")
    return first


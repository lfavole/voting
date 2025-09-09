from allauth.socialaccount.providers.base import ProviderAccount
from allauth.socialaccount.providers.oauth2.provider import OAuth2Provider
from django.utils.translation import gettext_lazy as _

from .views import GovernmentOAuth2Adapter


class GovernmentAccount(ProviderAccount):
    pass


class GovernmentProvider(OAuth2Provider):
    id = "government"
    name = _("Government")
    account_class = GovernmentAccount
    oauth2_adapter_class = GovernmentOAuth2Adapter

    def extract_uid(self, data):
        return str(data["sub"])

    def extract_common_fields(self, data):
        return {
            "username": data.get("username"),
            "email": data.get("email"),
            "first_name": data.get("first_name"),
            "last_name": data.get("last_name"),
        }

    def get_default_scope(self):
        scope = ["read"]
        return scope


provider_classes = [GovernmentProvider]

from allauth.core import context
from allauth.socialaccount import app_settings
from allauth.socialaccount.adapter import get_adapter
from allauth.socialaccount.models import SocialToken
from allauth.socialaccount.providers.oauth2.views import (
    OAuth2Adapter,
    OAuth2CallbackView,
    OAuth2LoginView,
)


class GovernmentOAuth2Adapter(OAuth2Adapter):
    provider_id = "government"

    def _build_server_url(self, path):
        settings = app_settings.PROVIDERS.get(self.provider_id, {})
        server = settings.get("SERVER", "https://government.example.org")
        # Prefer app based setting.
        app = get_adapter().get_app(context.request, provider=self.provider_id)
        server = app.settings.get("server", server)
        ret = f"{server}{path}"
        return ret

    @property
    def access_token_url(self):
        return self._build_server_url("/o/token/")

    @property
    def authorize_url(self):
        return self._build_server_url("/o/authorize/")

    @property
    def profile_url(self):
        return self._build_server_url("/api/userinfo")

    def complete_login(self, request, app, token: SocialToken, **kwargs):
        extra_data = self._get_user_info(token)
        return self.get_provider().sociallogin_from_response(request, extra_data)

    def _get_user_info(self, token: SocialToken):
        resp = (
            get_adapter()
            .get_requests_session()
            .get(self.profile_url, headers={"Authorization": f"Bearer {token.token}"})
        )
        resp.raise_for_status()
        return resp.json()


oauth2_login = OAuth2LoginView.adapter_view(GovernmentOAuth2Adapter)
oauth2_callback = OAuth2CallbackView.adapter_view(GovernmentOAuth2Adapter)

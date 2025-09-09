from .provider import GovernmentProvider
from allauth.socialaccount.providers.oauth2.urls import default_urlpatterns


urlpatterns = default_urlpatterns(GovernmentProvider)

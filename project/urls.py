from allauth.account.decorators import secure_admin_login
from debug_toolbar.toolbar import debug_toolbar_urls
from django.contrib import admin
from django.urls import include, path

admin.autodiscover()
admin.site.login = secure_admin_login(admin.site.login)

urlpatterns = [
    path("", include("voting.urls")),
    path("admin/", admin.site.urls),
    path("accounts/", include("allauth.urls")),
    *debug_toolbar_urls(),
]

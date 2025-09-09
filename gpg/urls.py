from django.urls import path

from . import views

urlpatterns = [
    path("list", views.PublicKeysFormView.as_view(), name="public_keys"),
    path("verify/<int:pk>", views.VerifyKeyView.as_view(), name="verify_key"),
]

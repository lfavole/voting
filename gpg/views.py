import pgpy
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.utils.translation import gettext as _
from pgpy.errors import PGPError
from project.common_views import AjaxFormView, MultipleFormView
from project.utils import is_curl, is_xhr

from .forms import (
    AddPublicKeyForm,
    AddTemporaryPublicKeysForm,
    ManagePublicKeysForm,
    SearchPublicKeysForm,
    VerifyKeyForm,
)
from .models import GPGKey
from .utils import handle_added_email


@method_decorator(login_required, name="dispatch")
class PublicKeysFormView(MultipleFormView, AjaxFormView):
    template_name = "gpg/public_keys.html"
    success_url = reverse_lazy("public_keys")

    form_classes = {
        SearchPublicKeysForm: {
            "search": "search_public_keys",
        },
        AddTemporaryPublicKeysForm: {
            "add_temporary": "add_temporary_public_keys",
        },
        ManagePublicKeysForm: {
            "remove": "remove_public_key",
            "primary": "set_primary_key",
            "verify": "verify_public_key",
        },
        AddPublicKeyForm: {
            "add": "add_public_key",
        },
    }

    def get_ajax_data(self):
        return {
            "keys": [
                {
                    "fingerprint": key.fingerprint,
                    "emails": key.emails.split("\n"),
                    "primary": key.primary,
                    "verified": key.verified,
                }
                for key in GPGKey.objects.filter(user=self.request.user)
            ],
        }

    def search_public_keys(self, form):
        keys_added, keys_skipped = handle_added_email(Q(user=self.request.user))
        if not is_xhr(self.request):
            if keys_added and keys_skipped:
                messages.success(
                    self.request,
                    _(
                        f"Added %(keys_added)s public keys from your verified email addresses and skipped %(keys_skipped)s already existing public keys."
                    )
                    % {
                        "keys_added": keys_added,
                        "keys_skipped": keys_skipped,
                    },
                )
            if keys_added:
                messages.success(self.request, f"Added {keys_added} public keys from your verified email addresses.")
            if keys_skipped:
                messages.success(self.request, f"Skipped {keys_skipped} already existing public keys.")

    def add_temporary_public_keys(self, form):
        form.cleaned_data["keys"].update(temporary=False)

    def add_public_key(self, add_form):
        public_key: GPGKey = add_form.cleaned_data["public_key"]

        public_key.save()

        if not is_xhr(self.request):
            messages.success(self.request, "Public key added successfully.")

    def remove_public_key(self, form):
        selected_key: GPGKey = form.cleaned_data["key"]

        selected_key.delete()

        if not is_xhr(self.request):
            messages.success(self.request, "Public key removed successfully.")

    def set_primary_key(self, form):
        selected_key: GPGKey = form.cleaned_data["key"]

        selected_key.primary = True
        selected_key.save()

        if not is_xhr(self.request):
            messages.success(self.request, "Primary key set successfully.")

    def verify_public_key(self, form):
        selected_key: GPGKey = form.cleaned_data["key"]

        return redirect("verify_key", selected_key.id)


@method_decorator(login_required, name="dispatch")
class VerifyKeyView(AjaxFormView):
    template_name = "gpg/verify_key.html"
    form_class = VerifyKeyForm
    success_url = reverse_lazy("public_keys")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._key = None

    def get_ajax_data(self):
        if not self.key:
            return super().get_ajax_data()

        if is_xhr(self.request) and self.request.GET.get("check") and self.key.verified:
            messages.success(self.request, f"Key {self.key} verified successfully.")

        return {
            "name": str(self.key),
            "fingerprint": self.key.fingerprint,
            "verified": self.key.verified,
            "verification_command": self.key.verification_command,
            "verification_message": self.key.verification_message,
        }

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()

        if self.request.method == "POST":
            data = {"signed_message": self.request.body.decode(errors="ignore")}
            if self.get_form_class()(data).is_valid():
                kwargs["data"] = data

        return kwargs

    @property
    def key(self) -> GPGKey | None:
        if self._key is not None:
            return self._key
        if self.request.user.is_anonymous:
            return None
        self.key = get_object_or_404(GPGKey, id=self.kwargs["pk"], user=self.request.user)
        return self._key

    @key.setter
    def key(self, value):
        self._key = value

    def get_context_data(self, **kwargs):
        kwargs = super().get_context_data(**kwargs)

        if "key" not in kwargs:
            kwargs["key"] = self.key

        return kwargs

    def get(self, request, *args, **kwargs):
        if self.key and self.key.verified and not is_xhr(self.request):
            if not self.request.GET.get("verified"):
                messages.info(self.request, f"Key {self.key} is already verified.")

            # Redirect, do not display the success message
            return super().form_valid(self.get_form_class()())

        return super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        if self.key and self.key.verified:
            if is_curl(self.request):
                return HttpResponse("The key is already verified, no need to resubmit")

            if not is_xhr(self.request):
                if not self.request.GET.get("verified"):
                    messages.info(self.request, f"Key {self.key} is already verified.")

                # Redirect, do not display the success message
                return super().form_valid(self.get_form_class()())

        return super().post(request, *args, **kwargs)

    def form_valid(self, form):
        signed_message = form.cleaned_data["signed_message"]

        try:
            message: pgpy.PGPMessage = pgpy.PGPMessage.from_blob(signed_message)
        except PGPError as e:
            form.add_error("signed_message", f"Invalid PGP message: {e}")
            return self.form_invalid(form)

        if not message.is_signed:
            form.add_error("signed_message", "The provided message is not signed.")
            return self.form_invalid(form)

        if len(message.signers) > 1:
            form.add_error("signed_message", "The message has multiple signers, only one is allowed.")
            return self.form_invalid(form)

        if not message.signers:
            form.add_error("signed_message", "The message has no signers.")
            return self.form_invalid(form)

        # Find the key
        # If it isn't provided, figure it from the fingerprint
        # Don't verify ownership because it might be called from curl (without cookies)
        if not self.key:
            self.key = get_object_or_404(GPGKey, fingerprint=message.signatures[0].signer_fingerprint)

        if self.key.fingerprint != message.signatures[0].signer_fingerprint:
            form.add_error("signed_message", "The message is not signed by the provided key.")
            return self.form_invalid(form)

        if self.key.verification_message is None:
            form.add_error("signed_message", "No verification message found. Please get one beforehand.")
            return self.form_invalid(form)

        if self.key.verification_message != message.message:
            form.add_error("signed_message", "The message does not match the verification message.")
            return self.form_invalid(form)

        try:
            verified = self.key.pgpy.verify(message)
            if not verified:
                form.add_error("signed_message", "The signature could not be verified.")
                return self.form_invalid(form)
        except PGPError as e:
            form.add_error("signed_message", f"Error during verification: {e}")
            return self.form_invalid(form)

        self.key.verified = True
        self.key.save()

        if not is_xhr(self.request):
            messages.success(self.request, f"Key {self.key} verified successfully.")

        if is_curl(self.request):
            return HttpResponse("The key is now verified, check your browser")

        return super().form_valid(form)

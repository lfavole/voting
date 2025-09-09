from allauth.account.models import EmailAddress
from django import forms
from django.core.exceptions import ValidationError
from gpg.fields import GPGKeyField, MultipleGPGKeyField
from gpg.models import GPGKey, NotPublicKey
from pgpy.errors import PGPError
from project.middleware import request


class SearchPublicKeysForm(forms.Form):
    pass


class AddTemporaryPublicKeysForm(forms.Form):
    keys = MultipleGPGKeyField(temporary=True, to_field_name="fingerprint", widget=forms.CheckboxSelectMultiple)


class ManagePublicKeysForm(forms.Form):
    key = GPGKeyField(to_field_name="fingerprint", widget=forms.RadioSelect)


class AddPublicKeyForm(forms.Form):
    public_key = forms.CharField(widget=forms.Textarea, label="Public Key")

    def clean_public_key(self):
        public_key = self.cleaned_data["public_key"]

        try:
            public_key = GPGKey.from_blob(public_key)
        except NotPublicKey:
            raise ValidationError("The provided key is not a public key")
        except (TypeError, ValueError, PGPError) as e:
            raise ValidationError(f"Invalid public key: {type(e).__name__}: {e}")

        emails = public_key.emails.split("\n")
        unverified_emails = EmailAddress.objects.filter(user=request.user, email__in=emails, verified=False)
        if unverified_emails:
            raise ValidationError(
                "This key contains the following unverified email addresses:\n"
                + ", ".join(email.email for email in unverified_emails),
            )
        else:
            public_key.user = request.user

        return public_key


class VerifyKeyForm(forms.Form):
    signed_message = forms.CharField(widget=forms.Textarea)

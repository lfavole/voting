from urllib.parse import quote, urlparse
from urllib.request import urlopen

from django.conf import settings
from django.db import models
import pgpy
from pgpy.errors import PGPError

from .models import GPGKey, TemporaryGPGKey
from . import settings as app_settings

class KeyDownloadError(Exception):
    """Custom exception for key download errors."""

    pass


def download_key(key_id_or_email, key_server="keys.openpgp.org"):
    parse_result = urlparse(key_server)
    key_server = parse_result.hostname or parse_result.path
    try:
        with urlopen(f"https://{key_server}/pks/lookup?op=get&options=mr&search={quote(key_id_or_email)}") as response:
            if response.status == 200:
                key_data = response.read().decode("utf-8")
                public_key, _ = pgpy.PGPKey.from_blob(key_data)
                return public_key  # Return the PGPKey object
            else:
                raise KeyDownloadError(f"Failed to download key: HTTP {response.status}")
    except (TypeError, ValueError, PGPError) as e:
        raise KeyDownloadError(f"An error occurred while downloading the key: {str(e)}")


# If allauth is installed,
if "allauth" in settings.INSTALLED_APPS:
    from allauth.account.models import EmailAddress
    from allauth.account.signals import email_added, email_changed, email_removed

    def handle_added_email(query):
        # Search on the public key server for a GPG key that has this email
        # If found, create a TemporaryGPGKey for each found key
        eas = EmailAddress.objects.all()
        if isinstance(query, models.Q):
            eas = eas.filter(query)
        elif isinstance(query, (list, tuple)):
            eas = eas.filter(email__in=query)
        else:
            eas = eas.filter(email=query)

        # Return two counts: number of keys added, number of keys skipped (already exist)
        keys_added = 0
        keys_skipped = 0

        for ea in eas:
            ea: EmailAddress
            for keyserver in app_settings.KEYSERVERS:
                try:
                    public_key = download_key(ea.email, key_server=keyserver)
                    break
                except KeyDownloadError:
                    continue
            else:
                continue
            temp_key = TemporaryGPGKey.from_blob(str(public_key))
            # If the key already exists, skip it
            # Check all keys (temporary or not)
            if GPGKey._base_manager.filter(fingerprint=temp_key.fingerprint).exists():
                keys_skipped += 1
                continue
            temp_key.user = ea.user
            temp_key.save()
            keys_added += 1

        return keys_added, keys_skipped

    def handle_removed_email(email_address):
        if isinstance(email_address, EmailAddress):
            email_address = email_address.email
        # Remove any TemporaryGPGKey that has this email if no EmailAddress exists with this email
        temporary_keys = TemporaryGPGKey.objects.filter(emails__contains=email_address.lower())
        keys_to_remove_pks = []
        for key in temporary_keys:
            emails = key.emails.split("\n")
            # Filter and keep only where an associated EmailAddress exists
            # Optimize the query, do only one query
            emails = [email.email for email in EmailAddress.objects.filter(email__in=emails)]
            if not emails:
                keys_to_remove_pks.append(key.pk)

        if keys_to_remove_pks:
            TemporaryGPGKey.objects.filter(pk__in=keys_to_remove_pks).delete()

    if app_settings.AUTO_FETCH_KEYS_FROM_KEYSERVERS:
        email_added.connect(lambda email_address, **_: handle_added_email(email_address))
        email_changed.connect(lambda to_email_address, **_: handle_added_email(to_email_address))

    email_changed.connect(lambda from_email_address, **_: handle_removed_email(from_email_address))
    email_removed.connect(lambda email_address, **_: handle_removed_email(email_address))

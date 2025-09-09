from django.conf import settings

AUTO_FETCH_KEYS_FROM_KEYSERVERS = getattr(settings, "GPG_AUTO_FETCH_KEYS_FROM_KEYSERVERS", False)
EXTRA_KEYSERVERS = getattr(settings, "GPG_EXTRA_KEYSERVERS", [])
KEYSERVERS = getattr(settings, "GPG_KEYSERVERS", ["keyserver.ubuntu.com", "keys.openpgp.org", "pgp.mit.edu"])
KEYSERVERS += EXTRA_KEYSERVERS
KEYSERVERS = list(dict.fromkeys(KEYSERVERS))  # Remove duplicates while preserving order

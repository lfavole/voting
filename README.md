# Voting Django App

A voting system with GPG public key requirement, tokenized voting, anonymous ballot IDs, and per-vote directory with checksum.

## Features
- User registration via `django-allauth`
- GPG public key association per user
- Person votes and choice votes (abstract vote model)
- Token-based voting (tokens not associated to user, and only one per user)
- Ballot submission with decrypted token, ballot ID returned
- Ballot lookup via `/data/votes/<vote_pk>/<ballot_id>/`
- Directory view and checksum at `/data/votes/<vote_pk>/`

## Models
- `GPGKey`: GPG public key per user
- `Vote`, `PersonVote`, `ChoiceVote`
- `Token`: issued per vote, not tied to user
- `Ballot`: stores submitted votes, ballot ID, checksum

## API
- `/get_token/<vote_type>/<pk>/`: Get a token for a vote (login required)
- `/submit_vote/<vote_pk>/`: Submit a vote (no login required)
- `/data/votes/<pk>/<ballot_id>/`: View your ballot
- `/data/votes/<pk>/`: View directory of ballots and checksum

## Setup

1. Add to `INSTALLED_APPS`:
    ```python
    'voting',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    ```
2. Run migrations:
    ```
    python manage.py makemigrations voting
    python manage.py migrate
    ```
3. Register via `/accounts/signup/` (allauth)
4. Add your GPG key via admin or profile page.

## Security

- Token is issued anonymously; only one per user per vote.
- Ballot submission does not require login.
- Ballots are referenced by random ballot IDs.

## Notes

- You may want to extend ballot storage to files for the directory listing.
- Add custom logic for GPG verification and token encryption/decryption as needed.

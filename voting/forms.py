from django import forms
from django.utils.translation import gettext_lazy as _
from gpg.fields import GPGKeyField
from project.middleware import request

from .models import ChoiceVote, PersonVote, Vote


class GetTokenForm(forms.Form):
    key = GPGKeyField(to_field_name="fingerprint", widget=forms.RadioSelect)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields = {
            "vote": forms.ModelChoiceField(request.user.allowed_votes.all(), widget=forms.RadioSelect),
            "key": self.fields["key"],
        }


def get_submit_vote_form(vote: Vote) -> type[forms.Form]:
    # For choice votes, you just vote yes, no or don't know
    # For person vote, you give a mark from 1 to 7 to each person

    if isinstance(vote, ChoiceVote):
        class SubmitChoiceVoteForm(forms.Form):
            token = forms.CharField()
            choice = forms.ChoiceField(
                choices=(
                    ("yes", _("Yes")),
                    ("no", _("No")),
                    ("dont_know", _("Don't know")),
                ),
                widget=forms.RadioSelect,
            )

            def get_json_data(self):
                return {
                    "choice": {
                        "yes": True,
                        "no": False,
                        "dont_know": None,
                    }[self.cleaned_data["choice"]],
                }

        return SubmitChoiceVoteForm
    elif isinstance(vote, PersonVote):
        class SubmitPersonVoteForm(forms.Form):
            token = forms.CharField()
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                for person in vote.persons.all():
                    self.fields[f"person_{person.pk}"] = forms.ChoiceField(
                        label=str(person),
                        choices=[(i, str(i)) for i in range(1, 8)],
                        widget=forms.RadioSelect,
                    )

            def get_json_data(self):
                return {
                    "persons": {
                        int(name.split("_")[1]): int(value)
                        for name, value in self.cleaned_data.items()
                        if name.startswith("person_")
                    },
                }
        return SubmitPersonVoteForm

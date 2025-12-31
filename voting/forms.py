from functools import lru_cache

from django import forms
from django.utils.translation import gettext_lazy as _

from .models import ChoiceVote, PersonVote, Vote

PERSON_CHOICES = ("Très bien", "Bien", "Assez bien", "Passable", "Insuffisant", "À rejeter", "Ne sait pas")


@lru_cache
def get_submit_vote_form(vote: Vote) -> type[forms.Form]:
    # For choice votes, you just vote yes, no or don't know
    # For person vote, you give a mark from 1 to 7 to each person

    if isinstance(vote, ChoiceVote):
        class SubmitChoiceVoteForm(forms.Form):
            choice = forms.ChoiceField(
                choices=(
                    ("yes", _("Yes")),
                    ("no", _("No")),
                    ("dont_know", _("Don't know")),
                ),
                widget=forms.RadioSelect,
                initial="dont_know",
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
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                for person in vote.persons.all():
                    self.fields[f"person_{person.pk}"] = forms.ChoiceField(
                        choices=[*enumerate(PERSON_CHOICES, start=1)],
                        widget=forms.RadioSelect,
                        label=str(person),
                        initial=len(PERSON_CHOICES),
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

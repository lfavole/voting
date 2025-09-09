import hashlib
import os

import pgpy
from django import forms
from django.contrib.auth.decorators import login_required
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse_lazy
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.translation import gettext as _
from django.views.decorators.csrf import csrf_exempt
from django.views.generic.list import ListView
from gpg.models import GPGKey
from gpg.views import VerifyKeyView
from project.common_views import AjaxFormView
from project.utils import is_xhr

from .forms import GetTokenForm, get_submit_vote_form
from .models import Ballot, Token, TokenAttribution, Vote


@method_decorator(login_required, name="dispatch")
class GetTokenFormView(AjaxFormView):
    template_name = "voting/get_token.html"
    form_class = GetTokenForm

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.encrypted_message = None

    def get_ajax_data(self):
        if self.encrypted_message:
            return {"encrypted_message": str(self.encrypted_message)}
        now = timezone.now()
        return {
            "votes": list(
                Vote.objects.filter(
                    start_time__lte=now,
                    end_time__gte=now,
                )
                .values("uuid", "name")
                .order_by("name")
            ),
        }

    def form_valid(self, form: forms.Form) -> HttpResponse:
        vote = form.cleaned_data["vote"]

        if TokenAttribution.objects.filter(user=self.request.user, vote=vote).exists():
            form.add_error(None, "Token already issued")
            return self.form_invalid(form)

        value = hashlib.sha256(os.urandom(64)).hexdigest()
        Token.objects.create(value=make_password(value), vote=vote)
        TokenAttribution.objects.create(user=self.request.user, vote=vote)

        # Encrypt the value with the GPG public key
        public_key = form.cleaned_data["key"]
        message = pgpy.PGPMessage.new(value)
        self.encrypted_message = public_key.pgpy.encrypt(message)

        return render(self.request, "voting/token.html", {"encrypted_message": self.encrypted_message})


@csrf_exempt
def submit_vote(request, vote_uuid):
    if request.user:
        return general_error_or_redirect(request, "You must not be logged in to submit a vote", status=403)

    if request.method == "POST":
        token_value = request.POST.get("decrypted_token")
        selection = request.POST.get("selection")

        token = Token.objects.filter(value=token_value, vote_uuid=vote_uuid, is_used=False).first()
        if not token:
            return JsonResponse({"error": "Invalid token"}, status=400)

        token.is_used = True
        token.save()

        ballot_id = Ballot.generate_ballot_id()
        while Ballot.objects.filter(ballot_id=ballot_id).exists():
            ballot_id = Ballot.generate_ballot_id()
        checksum = hashlib.sha256(f"{ballot_id}{selection}{token_value}".encode()).hexdigest()
        Ballot.objects.create(
            ballot_id=ballot_id, vote_uuid=vote_uuid, token=token_value, selection=selection, checksum=checksum
        )
        return JsonResponse({"ballot_id": ballot_id})
    return JsonResponse({"error": "POST required"}, status=405)


def submit(request):
    return render(request, "voting/submit_vote.html")


@method_decorator(csrf_exempt, name="dispatch")
class HomepageView(VerifyKeyView):
    def dispatch(self, request, *args, **kwargs):
        return super(VerifyKeyView, self).dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        return render(request, "home.html")


class TokenListView(ListView):
    model = Token
    context_object_name = "tokens"
    template_name = "voting/token_list.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["vote"] = get_object_or_404(Vote, uuid=self.kwargs["vote_uuid"])
        return context

    def get_queryset(self):
        return Token.objects.filter(vote__uuid=self.kwargs["vote_uuid"])


def token_view(request, vote_uuid, pk):
    token = get_object_or_404(Token, vote__uuid=vote_uuid, pk=pk)
    return HttpResponse(token.value, content_type="text/plain")


class BallotListView(ListView):
    model = Ballot
    context_object_name = "ballots"
    template_name = "voting/ballot_list.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["vote"] = get_object_or_404(Vote, uuid=self.kwargs["vote_uuid"])
        return context

    def get_queryset(self):
        return Ballot.objects.filter(vote__uuid=self.kwargs["vote_uuid"])


def ballot_view(request, vote_uuid, pk):
    ballot = get_object_or_404(Ballot, vote__uuid=vote_uuid, pk=pk)
    return HttpResponse(ballot.value, content_type="text/plain")


class VotesListView(ListView):
    model = Vote
    context_object_name = "votes"
    template_name = "voting/vote_list.html"

    def get_queryset(self):
        now = timezone.now()
        return Vote.objects.filter(start_time__lte=now, end_time__gte=now).order_by("name")


@method_decorator(login_required, name="dispatch")
class SubmitVoteView(AjaxFormView):
    template_name = "voting/submit_vote.html"
    success_url = reverse_lazy("votes_list")

    def get_form_class(self):
        return get_submit_vote_form(self.vote)

    def dispatch(self, request, *args, **kwargs):
        self.vote = get_object_or_404(Vote, uuid=self.kwargs["vote_uuid"])
        if not request.user.allowed_votes.filter(pk=self.vote.pk).exists():
            raise PermissionDenied(_("You are not allowed to vote in this election"))
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form: forms.Form) -> HttpResponse:
        given_token = form.cleaned_data["token"]
        tokens = Token.objects.filter(vote=self.vote, is_used=False)
        token = None
        for token_to_try in tokens:
            # Don't bother upgrading the hash, the tokens are used only once
            if check_password(given_token, token_to_try.value):
                token = token_to_try
                break
        else:
            form.add_error("token", _("Invalid token"))
            return self.form_invalid(form)

        token.is_used = True
        token.save()

        Ballot.objects.create(vote=self.vote, result=form.get_json_data())
        return render(self.request, "voting/submit_vote_success.html", {"vote": self.vote})

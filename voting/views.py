import base64
import hashlib
import json

from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.translation import gettext as _
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.views.generic.list import ListView

from .forms import get_submit_vote_form
from .models import Ballot, Vote, VoterStatus
from project.utils import is_xhr


def get_public_key(request, vote_uuid):
    """Expose la clé publique spécifique à un vote au format PEM."""
    vote_obj = get_object_or_404(Vote, uuid=vote_uuid)
    # get_keys() génère les clés si elles n'existent pas encore
    pub_key, _ = vote_obj.get_keys()
    return HttpResponse(vote_obj.public_key_pem, content_type="application/x-pem-file")


@csrf_exempt
@login_required
def sign_blind_token(request, vote_uuid):
    """
    Signe un jeton aveuglé de manière idempotente.
    Vérifie si l'utilisateur a déjà demandé une signature pour ce vote précis.
    """
    if request.method != 'POST':
        return JsonResponse({"error": "Méthode non autorisée"}, status=405)

    vote_obj = get_object_or_404(Vote, uuid=vote_uuid)
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Payload JSON invalide"}, status=400)
    blinded_message_b64 = data.get("blinded_message")

    if not blinded_message_b64:
        return JsonResponse({"error": "Message aveuglé manquant"}, status=400)

    # 1. Gestion de l'idempotence via VoterStatus
    status, created = VoterStatus.objects.get_or_create(
        user=request.user,
        vote=vote_obj
    )

    # Calcul du hash du message aveuglé pour comparaison
    incoming_hash = hashlib.sha256(blinded_message_b64.encode()).hexdigest()

    if status.has_signed:
        # Si le hash correspond, c'est un retry (problème réseau client) : on renvoie la signature
        if status.blinded_message_hash == incoming_hash:
            return JsonResponse({
                "signature": status.generated_signature,
                "status": "already_signed_retry"
            })
        else:
            # Si le hash est différent, c'est une tentative de signer un DEUXIÈME bulletin
            return JsonResponse({
                "error": "Vous avez déjà obtenu une signature pour un bulletin différent."
            }, status=403)

    # 2. Phase de signature cryptographique
    _, priv_key = vote_obj.get_keys()

    # Décodage Base64 -> Int
    blinded_int = int.from_bytes(base64.b64decode(blinded_message_b64), "big")

    # Signature RSA : sig = blinded_int^d mod n
    sig_int = pow(blinded_int, priv_key.d, priv_key.n)

    # Encodage Int -> Base64
    sig_b64 = base64.b64encode(sig_int.to_bytes(256, "big")).decode()

    # 3. Sauvegarde de l'état pour l'idempotence futur
    status.blinded_message_hash = incoming_hash
    status.generated_signature = sig_b64
    status.has_signed = True
    status.save()

    return JsonResponse({"signature": sig_b64})


@csrf_exempt
def submit_vote(request, vote_uuid):
    """
    Réceptionne le bulletin, valide la signature aveugle par rapport au contenu
    du formulaire et enregistre le vote de manière anonyme.
    """
    if request.method != 'POST':
        return JsonResponse({"error": "Méthode non autorisée"}, status=405)

    # 1. Récupération du vote concerné
    vote_obj = get_object_or_404(Vote, uuid=vote_uuid)

    # 2. Instanciation du formulaire dynamique avec les données POST
    json_payload = request.POST.get('data', '')
    try:
        result_data = json.loads(json_payload)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Payload JSON invalide"}, status=400)

    # 3. Extraction des composants du bulletin
    token = request.POST.get('token', '')
    signature_b64 = request.POST.get('signature', '')

    # 4. Reconstruction du message pour vérification du Hash
    # Il est CRUCIAL d'utiliser sort_keys=True et les séparateurs compacts
    # pour que le JSON généré ici soit identique au caractère près à celui du client JS.
    # json_payload = json.dumps(result_data, sort_keys=True, separators=(',', ':'))
    message_content = f"{token}:{json_payload}".encode('utf-8')

    # Calcul du hash SHA-256 (m)
    hash_obj = hashlib.sha256(message_content).digest()
    m_int = int.from_bytes(hash_obj, "big")

    # 5. Vérification cryptographique avec la clé publique du Singleton
    pub_key, _priv_key = vote_obj.get_keys()

    try:
        # Décodage de la signature Base64
        sig_bytes = base64.b64decode(signature_b64)
        sig_int = int.from_bytes(sig_bytes, "big")

        # Vérification RSA : sig^e mod n == m
        if pow(sig_int, pub_key.e, pub_key.n) != m_int:
            return JsonResponse({
                "error": "Signature invalide. Le bulletin a été modifié ou la signature est incorrecte."
            }, status=400)

    except Exception as e:
        return JsonResponse({"error": f"Erreur de décodage de la signature : {str(e)}"}, status=400)

    # 6. Enregistrement anonyme dans l'urne (Ballot)
    # On utilise get_or_create pour gérer l'idempotence (renvoi du bulletin)
    ballot, created = Ballot.objects.get_or_create(
        token=token,
        vote=vote_obj,
        defaults={
            'result': result_data,
            'server_signature': signature_b64,  # On stocke la signature pour l'audit public
        }
    )

    status_code = 201 if created else 200
    return JsonResponse({
        "status": "success",
        "message": "Votre vote a été enregistré.",
        "bulletin_id": token,
        "is_new": created
    }, status=status_code)


@method_decorator(csrf_exempt, name="dispatch")
class HomepageView(View):
    def get(self, request, *args, **kwargs):
        return render(request, "home.html")


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


def ballot_view(request, vote_uuid, token):
    return JsonResponse(get_object_or_404(Ballot, vote__uuid=vote_uuid, token=token).result)


class VotesListView(ListView):
    model = Vote
    context_object_name = "votes"
    template_name = "voting/vote_list.html"

    def get_queryset(self):
        now = timezone.now()
        if self.request.user.is_anonymous:
            return Vote.objects.none()
        return Vote.objects.filter(
            start_time__lte=now,
            end_time__gte=now,
            allowed_users__in=[self.request.user]
        ).order_by("name")


@login_required
def submit_vote_view(request, vote_uuid):
    vote = get_object_or_404(Vote, uuid=vote_uuid)
    if not request.user.allowed_votes.filter(pk=vote.pk).exists():
        raise PermissionDenied(_("You are not allowed to vote in this election"))
    if is_xhr(request) and request.method == "GET":
        form = get_submit_vote_form(vote)
        form_spec = {
            "title": vote.name,
            "fields": {},
            "field_order": [],
        }
        for field in form():
            field_spec = {
                "label": str(field.label),
                "value": field.value(),
                "help_text": str(field.help_text),
                "errors": [str(e) for e in field.errors],
                "widget": {
                    "attrs": {
                        k: str(v) for k, v in field.field.widget.attrs.items()
                    },
                },
                "choices": [
                    {"value": choice_value, "display": str(choice_label)}
                    for choice_value, choice_label in getattr(field.field, "choices", [])
                ],
            }
            form_spec["fields"][field.html_name] = field_spec
            form_spec["field_order"].append(field.html_name)
        return JsonResponse(form_spec)
    return render(request, "voting/submit_vote.html", {"vote": vote, "form": get_submit_vote_form(vote)})



def voting_help(request):
    return render(request, "voting/help_protocol.html")

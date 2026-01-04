import uuid

from allauth.account.models import EmailAddress
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.timezone import now
from django_countries.fields import CountryField
from polymorphic.models import PolymorphicModel
import rsa


class CustomUser(AbstractUser):
    # for compatibility with some django features
    @property
    def email(self):
        if not self.pk:
            return ""
        return EmailAddress.objects.get(user=self, primary=True).email

    @email.setter
    def email(self, value):
        if not self.pk:
            return
        email_address, _ = EmailAddress.objects.get_or_create(user=self, primary=True)
        email_address.email = value
        email_address.save()

    country = CountryField(default="FR")
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)


class Query(models.Model):
    name = models.CharField(max_length=255)
    query_parameters = models.JSONField()

    def __str__(self):
        return self.name


class Person(models.Model):
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name


class Vote(PolymorphicModel):
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    allowed_users = models.ManyToManyField("CustomUser", blank=True, related_name="allowed_votes")

    private_key_pem = models.TextField(blank=True, null=True, editable=False)
    public_key_pem = models.TextField(blank=True, null=True, editable=False)

    def get_keys(self):
        """Récupère les clés ou les génère à la volée si elles n'existent pas."""
        if not self.public_key_pem or not self.private_key_pem:
            # Génération d'une paire de clés 2048 bits spécifique à ce vote
            (pub, priv) = rsa.newkeys(2048)
            self.public_key_pem = pub.save_pkcs1().decode('utf-8')
            self.private_key_pem = priv.save_pkcs1().decode('utf-8')
            self.save()

        pub = rsa.PublicKey.load_pkcs1(self.public_key_pem.encode('utf-8'))
        priv = rsa.PrivateKey.load_pkcs1(self.private_key_pem.encode('utf-8'))
        return pub, priv

    def can_vote(self, user):
        """Vérifie si l'utilisateur a le droit de voter."""
        # On vérifie la date
        if now() < self.start_time:
            return (False, "not_started")
        if now() > self.end_time:
            return (False, "ended")
        if user.is_anonymous or not user.allowed_votes.filter(pk=self.pk).exists():
            return (False, "user")
        return (True, "")

    def __str__(self):
        return self.name


class PersonVote(Vote):
    persons = models.ManyToManyField(Person, related_name="person_votes")

    def __str__(self):
        return self.name


class Proposition(models.Model):
    text = models.CharField(max_length=512)


class ChoiceVote(Vote):
    propositions = models.ManyToManyField(Proposition, related_name="choice_votes")

    def __str__(self):
        return self.name


class VoterStatus(models.Model):
    """
    Assure l'unicité du vote par utilisateur ET l'idempotence.
    On lie l'utilisateur au Vote, mais PAS au bulletin final.
    """
    user = models.ForeignKey("CustomUser", on_delete=models.CASCADE)
    vote = models.ForeignKey(Vote, on_delete=models.CASCADE)

    # Stockage pour l'idempotence (en cas de coupure réseau)
    blinded_message_hash = models.TextField(blank=True, null=True, help_text="Hash du message aveuglé pour vérifier l'idempotence")
    generated_signature = models.TextField(blank=True, null=True, help_text="Signature renvoyée au client (Base64)")

    has_signed = models.BooleanField(default=False)

    class Meta:
        unique_together = ('user', 'vote')
        verbose_name = "Statut de signature de l'électeur"

class Ballot(models.Model):
    """
    L'urne numérique. Ce modèle n'a AUCUNE relation avec CustomUser.
    Le champ 'token' est le jeton Base64 généré par le client.
    """
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    vote = models.ForeignKey(Vote, on_delete=models.CASCADE, related_name="ballots")

    # Le 'token' est l'identifiant public du bulletin (Base64)
    token = models.CharField(max_length=512, unique=True, db_index=True)

    # Résultat du vote (ex: {"choice_id": 1} ou {"person_id": 5})
    result = models.TextField(help_text="Données JSON du vote soumis")

    # Signature serveur stockée pour vérification publique immédiate par des tiers
    server_signature = models.TextField(help_text="Signature Base64 prouvant l'authenticité")

    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # On vérifie si le JSON est minifié correctement
        import json
        try:
            parsed = json.loads(self.result)
            expected_result = json.dumps(parsed, sort_keys=True, separators=(',', ':'))
        except json.JSONDecodeError:
            raise ValueError("Le champ 'result' doit être un JSON valide.")
        if self.result != expected_result:
            raise ValueError("Le champ 'result' doit être un JSON minifié, trié par clés, sans espaces inutiles.")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Ballot {self.token[:15]}... ({self.vote.name})"

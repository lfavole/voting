import uuid

from allauth.account.models import EmailAddress
from django.contrib.auth.models import AbstractUser
from django.db import models
from django_countries.fields import CountryField
from polymorphic.models import PolymorphicModel


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


class Token(models.Model):
    value = models.CharField(max_length=128, unique=True)
    vote = models.ForeignKey(Vote, on_delete=models.CASCADE)
    is_used = models.BooleanField(default=False)


class TokenAttribution(models.Model):
    user = models.ForeignKey("CustomUser", on_delete=models.CASCADE)
    vote = models.ForeignKey(Vote, on_delete=models.CASCADE)


class Ballot(models.Model):
    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    vote = models.ForeignKey(Vote, on_delete=models.CASCADE)
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

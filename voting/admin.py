from allauth.account.models import EmailAddress
from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField

from .models import Ballot, ChoiceVote, CustomUser, Person, PersonVote, Proposition, Token, TokenAttribution


class EmailAddressInline(admin.TabularInline):
    model = EmailAddress


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    inlines = [EmailAddressInline]


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    pass


@admin.register(PersonVote)
class PersonVoteAdmin(admin.ModelAdmin):
    readonly_fields = ("uuid",)


@admin.register(Proposition)
class PropositionAdmin(admin.ModelAdmin):
    pass


@admin.register(ChoiceVote)
class ChoiceVoteAdmin(admin.ModelAdmin):
    readonly_fields = ("uuid",)


class TokenAdminForm(forms.ModelForm):
    value = ReadOnlyPasswordHashField()

    class Meta:
        model = Token
        fields = "__all__"


@admin.register(Token)
class TokenAdmin(admin.ModelAdmin):
    form = TokenAdminForm
    fields = ("value", "vote", "is_used")


@admin.register(TokenAttribution)
class TokenAttributionAdmin(admin.ModelAdmin):
    pass


@admin.register(Ballot)
class BallotAdmin(admin.ModelAdmin):
    pass

from allauth.account.models import EmailAddress
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Ballot, ChoiceVote, CustomUser, Person, PersonVote, Proposition, VoterStatus


class EmailAddressInline(admin.TabularInline):
    model = EmailAddress
    extra = 0


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    inlines = [EmailAddressInline]
    fieldsets = [
        (
            name,
            {
                'fields': (
                    *(f for f in opts['fields'] if f != 'email'),
                    *(("country", "uuid") if i == 1 else ()),
                ),
            },
        )
        for i, (name, opts) in enumerate(UserAdmin.fieldsets)
    ]
    readonly_fields = ("uuid",)


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


@admin.register(VoterStatus)
class VoterStatusAdmin(admin.ModelAdmin):
    """
    Permet de voir QUI a voté, mais pas CE QU'ILS ont voté.
    Utile pour l'émargement numérique.
    """
    list_display = ('user', 'vote', 'has_signed', 'blinded_message_hash_preview')
    list_filter = ('vote', 'has_signed')
    search_fields = ('user__username',)
    readonly_fields = ('blinded_message_hash', 'generated_signature')

    def blinded_message_hash_preview(self, obj):
        return f"{obj.blinded_message_hash[:20]}..." if obj.blinded_message_hash else "N/A"
    blinded_message_hash_preview.short_description = "ID d'Aveuglement"

@admin.register(Ballot)
class BallotAdmin(admin.ModelAdmin):
    """
    L'urne numérique.
    Aucun lien avec l'utilisateur n'est affiché ici.
    """
    list_display = ('token_preview', 'vote', 'created_at')
    list_filter = ('vote', 'created_at')
    readonly_fields = ('uuid', 'token', 'result', 'server_signature', 'created_at')

    def token_preview(self, obj):
        return f"Bulletin {obj.token[:15]}..."
    token_preview.short_description = "Jeton (ID Bulletin)"

    def has_add_permission(self, request):
        # On interdit l'ajout manuel de bulletins par l'admin pour l'intégrité
        return False

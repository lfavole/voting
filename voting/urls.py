from django.urls import include, path

from . import views

urlpatterns = [
    path("", views.HomepageView.as_view(), name="home"),
    path("data/ballots/<uuid:vote_uuid>/<int:pk>", views.ballot_view, name="ballot"),
    path("data/ballots/<uuid:vote_uuid>/", views.BallotListView.as_view(), name="ballot_list"),
    path("data/tokens/<uuid:vote_uuid>/<int:pk>", views.token_view, name="token"),
    path("data/tokens/<uuid:vote_uuid>/", views.TokenListView.as_view(), name="token_list"),
    path("get-token", views.GetTokenFormView.as_view(), name="get_token"),
    path("keys/", include("gpg.urls")),
    path("submit-vote/<uuid:vote_uuid>", views.SubmitVoteView.as_view(), name="submit"),
    path("submit-vote/", views.VotesListView.as_view(), name="submit_list"),
]

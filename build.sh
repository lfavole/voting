python3 -m pip install --upgrade --disable-pip-version-check --target . . psycopg[binary,pool]~=3.2
python3 manage.py migrate &
# if it doesn't contain files, the deployment fails
mkdir static
echo "{}" > static/staticfiles.json
python3 manage.py collectstatic --noinput &
python3 manage.py compilemessages &
wait

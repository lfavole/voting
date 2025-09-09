import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from project.wsgi import application as app  # noqa

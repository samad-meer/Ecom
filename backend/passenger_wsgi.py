"""
Passenger entry point for cPanel shared hosting.

Passenger starts a Python app by importing this file and looking for a
module-level callable named `application`. Without it the app never starts,
LiteSpeed serves the document root as plain files, and every /api/ request
returns the web server's own 404 rather than anything from Django. That is
exactly what happened here: the app root contained manage.py and nothing else
Passenger could boot.

The real WSGI callable already exists in core/wsgi.py — this file only has to
be in the place Passenger looks and hand that callable over.

DEPLOYING THIS
  It must sit in the directory cPanel has as the *Application root*:

      /home3/zipnixte/public_html/centuryy/ecom-app/passenger_wsgi.py

  and Setup Python App must have

      Application root         public_html/centuryy/ecom-app
      Application startup file passenger_wsgi.py

  If the Application root is left one level up at public_html/centuryy,
  Passenger looks there, finds nothing, and the app stays down.
"""

import os
import sys

# The app root, wherever this file happens to live. Prepended rather than
# appended so `core` resolves to this project even if a same-named package
# exists elsewhere on the path.
APP_ROOT = os.path.dirname(os.path.abspath(__file__))
if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

from core.wsgi import application  # noqa: E402  (path must be set up first)

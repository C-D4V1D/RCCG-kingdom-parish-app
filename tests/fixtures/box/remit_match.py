# Test fixture: the top of the Clerk box's /workspace/rccg-remit/remit_match.py (as of 26 Sep 2026), enough for the patch anchors.
"""Shared matching between RCCG portal View Preview lines and the parish app's remittance breakdown
(output of compute-remit.js). Used by build-run.py and make-check-email.py. Read-only; no I/O side effects."""
import re

def norm(s):
    """Normalise a portal/app item name: lower case, single spaces, no spaces inside brackets."""
    s = re.sub(r'\s+', ' ', str(s)).strip().lower()
    return s.replace('( ', '(').replace(' )', ')')

def strip_brackets(s):
    return re.sub(r'\s*\([^)]*\)', '', s).strip()

# Portal item (normalised) -> how to find the app Part A line.
#   ('key', section, key, label_prefix or None) : income line by app income-type key (+ label prefix to split TG national/seed)
#   ('section', section)                        : the single line in that section
#   ('label', prefix)                           : first Part A line whose label starts with prefix (case-insensitive)
# Fixed quotas are matched generically: quota label without "(...)" == portal item (see find_app_line).
PORTAL_TO_APP = {
    'general tithe':            ('key', 'A-income', 'membersTithe', None),
    'ministers tithe':          ('key', 'A-income', 'ministersTithe', None),
    'sunday love offering':     ('key', 'A-income', 'slo', None),
    'sunday school':            ('key', 'A-income', 'sundaySchool', None),
    'crm':                      ('key', 'A-income', 'crm', None),
    'gospel fund':              ('key', 'A-income', 'workersOffering', None),
    'children offering':        ('key', 'A-income', 'childrenOffering', None),
    'holy communion offering':  ('key', 'A-income', 'holyCommunionOffering', None),
    'first fruit':              ('key', 'A-income', 'firstFruit', None),
    'thanksgiving':             ('key', 'A-income', 'thanksgiving', 'Thanksgiving (TG)'),
    'pastors seed':             ('label', 'Thanksgiving → Seed'),
    'coastline worship centre': ('label', 'Coastline Worship Centre'),
    'insurance fund (gen tithe)': ('label', 'Insurance Fund (GEN TITHE)'),
    'insurance fund (min tithe)': ('label', 'Insurance Fund (MIN TITHE)'),
    'province joint church planting': ('section', 'A-province'),
}
# App income types that have no agreed portal line yet (a human must add the mapping before they can be checked).
UNMAPPED_APP_KEYS = {'weekendOffering': 'Weekend Offering', 'custom_convention_thanksgiving': 'Convention Thanksgiving'}

# App income-type key -> name of the portal weekly-form line it is entered under.
APP_KEY_TO_WEEKLY_LINE = [
    ('membersTithe', 'General Tithe'), ('ministersTithe', 'Ministers Tithe'), ('thanksgiving', 'Thanksgiving'),
    ('slo', 'Sunday Love Offering'), ('crm', 'CRM'), ('workersOffering', 'Gospel Fund'), ('sundaySchool', 'Sunday School'),
    ('childrenOffering', 'Children Offering'), ('holyCommunionOffering', 'Holy Communion Offering'), ('firstFruit', 'First Fruit'),
]
# App fixed quotas that are typed on the portal's weekly form (entered in the LAST week). Other quotas appear on the
# portal preview automatically as "fixed" lines.
WEEKLY_FORM_QUOTAS = ['Regional Contribution']

def is_remita(label):
    return 'remita' in label.lower()

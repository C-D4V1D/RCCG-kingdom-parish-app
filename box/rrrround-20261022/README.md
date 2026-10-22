# rrrround-20261022: PROPOSAL, not installed. Why 79,189.41 (RRR) vs 79,189.40 (app)
Cause (measured from the 21 Oct RRR): the portal splits Open Heavens 8,575.00 into Province 156.07 (1.82%) + National 8,418.94 (98.18%).
Exact shares are 156.065 and 8,418.935; the portal rounds each half-up, so the split adds to 8,575.01. Split total 78,866.91, plus fee 300 and VAT 22.50 = 79,189.41.
The invoice amount stays 78,866.90 and the app's Part A is 78,866.90 + the fixed 322.50 = 79,189.40.
`make-rrr-email.py` refused on exactly this (amount + fee + VAT != total payable) and stopped the automatic run on 21 Oct 13:44.
`rrrcheck.check_rrr` accepts a split that differs from the invoice by portal rounding only and still refuses real mismatches. Tested offline.

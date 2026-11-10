---
'@owlieio/owlie': patch
---

A blocked request retried through the Webshare proxy now opens a new tunnel for each retry, so it really leaves from a new IP instead of reusing a pooled connection. arXiv, bioRxiv/medRxiv and NCBI (PubMed) requests are never retried this way, since their adapters pace their own requests.

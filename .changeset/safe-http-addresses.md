---
'owlie': patch
---

Harden safe HTTP fetching by canonically classifying IPv4 and IPv6 destinations,
rejecting URL credentials, narrowing the private-host opt-in, and removing URL
query and fragment secrets from diagnostics.

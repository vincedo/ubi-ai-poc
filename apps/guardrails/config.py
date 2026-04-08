from guardrails import Guard
from guardrails.hub import ToxicLanguage, DetectPII

# Validates text for toxic content and PII. Used for both input (blocking)
# and output (observability-only — result is logged but never gates the response).
input_safety = Guard(name="input-safety")
input_safety.use(ToxicLanguage(on_fail="exception"))
input_safety.use(DetectPII(pii_entities=["EMAIL_ADDRESS", "PHONE_NUMBER"], on_fail="exception"))

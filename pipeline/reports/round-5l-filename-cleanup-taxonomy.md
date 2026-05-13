# Round 5L Filename Cleanup Taxonomy

## Reason Codes

- ai_export_name: Filename exposes AI tool or generated-export wording such as ChatGPT, GPT, OpenAI, DALL-E, or ai-generated.
- failed_name: Filename exposes failed, failure, retry, or similar internal production status language.
- timestamp_name: Filename appears to be date or timestamp driven rather than subject driven.
- generic_name: Filename is too generic for a durable public object key.
- duplicate_tokens: Filename repeats adjacent tokens awkwardly.
- category_mismatch: Filename and category folder appear inconsistent and should not be moved automatically in this round.
- spelling_issue: Filename contains a safely detectable spelling issue.
- overly_long: Filename is longer than needed for a professional public URL.
- internal_pipeline_term: Filename exposes internal pipeline, upload, trace, or object-key wording.
- vague_subject: Filename does not contain enough subject detail for a confident clean key.
- collision_risk: Clean base stem would collide without a stable suffix.
- safe_existing_name: Current filename is already acceptable for public use.
- manual_review_required: Owner or later cleanup round should review before final upload.

## Confidence Levels

- high: The issue or clean name is strongly supported by existing metadata.
- medium: The clean name is likely acceptable but should be reviewed if the asset is important.
- low: The clean name uses conservative inference and should not be treated as final without review.
- manual_review: The item needs owner review or a later visual/name pass before final upload.

## Actions

- keep: Keep the current public object key stem.
- clean_public_object_key: Use a generated clean future object key while leaving current files unchanged.
- manual_review_before_full_upload: Review before the final full upload or exclude from that upload.
- defer: Do not decide the final name in this round.

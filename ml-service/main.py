import re
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from rapidfuzz import fuzz

app = FastAPI(
    title="Rubick AI Catalog ML Service",
    version="1.0.0"
)

# Canonical Cross-Regional Footwear Matrix Mapping 
SIZE_CONVERSION_TABLE = {
    "footwear": {
        "eu42": {"us": "8.5", "uk": "8", "eu": "42"},
        "eu41": {"us": "8", "uk": "7.5", "eu": "41"},
        "eu43": {"us": "9.5", "uk": "9", "eu": "43"},
        "us8.5": {"us": "8.5", "uk": "8", "eu": "42"},
        "uk8": {"us": "8.5", "uk": "8", "eu": "42"},
        "size8": {"us": "8", "uk": "7.5", "eu": "41"}
    }
}

STOPWORDS = {"shoes", "buy", "online", "men", "women", "india", "for", "with", "and"}
ABBREVIATIONS = {
    "blk": "black",
    "sz": "size",
    "wht": "white",
    "airmax": "air max"
}

class ProductPayload(BaseModel):
    title: str
    brand: str
    category_l1: str = Field(..., alias="categoryL1")
    raw_size: Optional[str] = Field(None, alias="rawSize")

class DedupChallengePayload(BaseModel):
    source_product: ProductPayload = Field(..., alias="sourceProduct")
    target_product: ProductPayload = Field(..., alias="targetProduct")

def clean_and_normalize_text(title: str) -> str:
    """Stage 3: Title Cleaning Engine Removing E-Commerce Noise """
    text = title.lower()
    text = re.sub(r'[/_,\-\(\)]', ' ', text)
    tokens = text.split()
    
    cleaned_tokens = []
    for token in tokens:
        token = ABBREVIATIONS.get(token, token)
        if token not in STOPWORDS and not re.match(r'^size$', token):
            cleaned_tokens.append(token)
            
    return " ".join(cleaned_tokens)

def normalize_dimension_size(category_l1: str, size_str: Optional[str]) -> Dict[str, str]:
    """Stage 2: Sizing Conversion Matrix Consolidation """
    if not size_str:
        return {"normalized": "unknown"}
    cat = category_l1.lower().strip()
    norm_target = size_str.lower().replace(" ", "")
    
    if cat in SIZE_CONVERSION_TABLE and norm_target in SIZE_CONVERSION_TABLE[cat]:
        return SIZE_CONVERSION_TABLE[cat][norm_target]
    return {"normalized": norm_target}

@app.post("/api/v1/dedup/evaluate")
async def evaluate_deduplication(payload: DedupChallengePayload):
    src = payload.source_product
    tgt = payload.target_product

    # STAGE 1: Blocking / Pre-Filtering Group By Constraints 
    if src.brand.lower().strip() != tgt.brand.lower().strip() or \
       src.category_l1.lower().strip() != tgt.category_l1.lower().strip():
        return {
            "is_match": False,
            "confidence": 0.0,
            "stage_resolved": 1,
            "reason": "Brand/L1 structural category grouping mismatch."
        }

    # STAGE 2 & 3: Normalization and Token Scrubbing 
    src_clean = clean_and_normalize_text(src.title)
    tgt_clean = clean_and_normalize_text(tgt.title)
    
    # STAGE 4: RapidFuzz Token Sort Indexing Execution 
    fuzzy_score = fuzz.token_sort_ratio(src_clean, tgt_clean) / 100.0

    if fuzzy_score >= 0.85: # Strict high precision threshold [cite: 278, 389]
        return {
            "is_match": True,
            "confidence": float(fuzzy_score),
            "stage_resolved": 4,
            "reason": "Fuzzy token alignment surpassed threshold validation bounds (>= 0.85)."
        }
        
    if fuzzy_score < 0.55:
        return {
            "is_match": False,
            "confidence": float(fuzzy_score),
            "stage_resolved": 4,
            "reason": "Fuzzy matching metric fell beneath base tracking parameters (< 0.55)."
        }

    # STAGE 5: Semantic Containment Emulation Layer 
    src_tokens = set(src_clean.split())
    tgt_tokens = set(tgt_clean.split())
    jaccard = len(src_tokens.intersection(tgt_tokens)) / len(src_tokens.union(tgt_tokens)) if src_tokens.union(tgt_tokens) else 0
    composite_score = (fuzzy_score * 0.4) + (jaccard * 0.6)

    if composite_score >= 0.88: # Cosine target threshold validation [cite: 278, 389]
        return {
            "is_match": True,
            "confidence": float(composite_score),
            "stage_resolved": 5,
            "reason": "Composite structural containment bounds surpassed validation index (>= 0.88)."
        }
        
    # STAGE 6: Human In The Loop Route Allocation 
    return {
        "is_match": False,
        "needs_human_review": True,
        "confidence": float(composite_score),
        "stage_resolved": 6,
        "reason": "Indeterminate matrix matching window. Scheduled for operational analyst assessment queue."
    }
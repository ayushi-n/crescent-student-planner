"""
course_recommender.py
----------------------
Lightweight TF-IDF course recommender ("RAG-lite"): matches the student's
branch, goals and skills against the course catalog's descriptions and tags,
with no external embedding API.

Pure Python on purpose -- it reproduces scikit-learn's TfidfVectorizer
defaults exactly (same tokenizer, English stop words, smoothed IDF and L2
normalisation, cosine similarity), so results are identical, but without
pulling ~150 MB of numpy/scipy/scikit-learn into the serverless bundle.
"""
from __future__ import annotations
import json
import math
import os
import re
from collections import Counter

CATALOG_PATH = os.path.join(os.path.dirname(__file__), "course_catalog.json")

with open(CATALOG_PATH, "r", encoding="utf-8") as f:
    _CATALOG = json.load(f)["courses"]

_TOKEN = re.compile(r"(?u)\b\w\w+\b")
_STOP_WORDS = frozenset("""
a about above across after afterwards again against all almost alone along already also although
always am among amongst amoungst amount an and another any anyhow anyone anything anyway
anywhere are around as at back be became because become becomes becoming been before beforehand
behind being below beside besides between beyond bill both bottom but by call can cannot cant co
con could couldnt cry de describe detail do done down due during each eg eight either eleven
else elsewhere empty enough etc even ever every everyone everything everywhere except few
fifteen fifty fill find fire first five for former formerly forty found four from front full
further get give go had has hasnt have he hence her here hereafter hereby herein hereupon hers
herself him himself his how however hundred i ie if in inc indeed interest into is it its itself
keep last latter latterly least less ltd made many may me meanwhile might mill mine more
moreover most mostly move much must my myself name namely neither never nevertheless next nine
no nobody none noone nor not nothing now nowhere of off often on once one only onto or other
others otherwise our ours ourselves out over own part per perhaps please put rather re same see
seem seemed seeming seems serious several she should show side since sincere six sixty so some
somehow someone something sometime sometimes somewhere still such system take ten than that the
their them themselves then thence there thereafter thereby therefore therein thereupon these
they thick thin third this those though three through throughout thru thus to together too top
toward towards twelve twenty two un under until up upon us very via was we well were what
whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever
whether which while whither who whoever whole whom whose why will with within without would yet
you your yours yourself yourselves
""".split())


def _tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP_WORDS]


def _tfidf(docs: list[list[str]]) -> list[dict[str, float]]:
    n = len(docs)
    df = Counter(term for doc in docs for term in set(doc))
    idf = {t: math.log((1 + n) / (1 + d)) + 1 for t, d in df.items()}
    vectors = []
    for doc in docs:
        tf = Counter(doc)
        vec = {t: c * idf[t] for t, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        vectors.append({t: v / norm for t, v in vec.items()})
    return vectors


def get_catalog() -> list[dict]:
    return _CATALOG


def recommend_courses(profile: dict, top_k: int = 6) -> list[dict]:
    branch = profile.get("branch", "") or ""
    goals = profile.get("goals", []) or []
    skills = profile.get("skills", []) or []
    query = " ".join(p for p in [branch] + list(goals) + list(skills) if p).strip()
    if not query:
        return []

    docs = [
        " ".join([c["name"], c["description"], " ".join(c.get("branch_tags", [])), " ".join(c.get("skill_tags", []))])
        for c in _CATALOG
    ]
    vectors = _tfidf([_tokens(d) for d in docs + [query]])
    q = vectors[-1]
    sims = [sum(w * q.get(t, 0.0) for t, w in v.items()) for v in vectors[:-1]]

    ranked = sorted(zip(_CATALOG, sims), key=lambda x: x[1], reverse=True)
    results = []
    for course, score in ranked[:top_k]:
        item = dict(course)
        item["match_score"] = round(float(score), 3)
        results.append(item)
    return results

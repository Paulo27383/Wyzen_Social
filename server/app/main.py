import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "wyzen.db"
MODEL_PATH = DATA_DIR / "intent_model.joblib"
ADMIN_TOKEN = os.getenv("WYZEN_ADMIN_TOKEN", "")

app = FastAPI(title="WYZEN Own Intelligence Server", version="0.1.0")


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    user_id: str = Field(default="android-user", min_length=1, max_length=100)


class TrainingExample(BaseModel):
    text: str = Field(min_length=2, max_length=1000)
    intent: str = Field(min_length=2, max_length=80)


def db():
    connection = sqlite3.connect(DB_PATH)
    connection.execute("""CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        message TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    connection.execute("""CREATE TABLE IF NOT EXISTS training_examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        intent TEXT NOT NULL
    )""")
    return connection


def classify(text: str) -> str:
    if MODEL_PATH.exists():
        try:
            import joblib
            model = joblib.load(MODEL_PATH)
            return str(model.predict([text])[0])
        except Exception:
            pass

    value = text.casefold()
    patterns = {
        "greeting": r"\b(olá|ola|bom dia|boa tarde|boa noite|oi|hey)\b",
        "time": r"\b(horas|que horas|hora atual)\b",
        "planning": r"\b(planear|planejar|organizar|agenda|tarefas|plano)\b",
        "learning": r"\b(aprender|ensinar|explicar|estudar|treinar)\b",
        "search": r"\b(pesquisar|procurar|buscar|pesquisa)\b",
        "translation": r"\b(traduz|traduzir|tradução)\b"
    }
    for intent, pattern in patterns.items():
        if re.search(pattern, value):
            return intent
    return "unknown"


def answer_for(intent: str, message: str) -> str:
    answers = {
        "greeting": "Olá! Sou a WYZEN. Estou a iniciar a minha aprendizagem. Em que posso ajudar?",
        "time": "Ainda não tenho acesso ao relógio do dispositivo. Essa será uma das ferramentas a integrar.",
        "planning": "Vamos organizar isso. Diz-me o objetivo, o prazo e as tarefas que já conheces.",
        "learning": "Posso guardar exemplos e conhecimentos que me ensines. Ainda estou numa fase inicial de aprendizagem.",
        "search": "A pesquisa na Internet ainda não está ligada. Posso preparar essa ferramenta na próxima etapa.",
        "translation": "Indica o texto e os idiomas de origem e destino. O meu motor linguístico ainda está em desenvolvimento.",
        "unknown": "Ainda não compreendi totalmente. Podes reformular ou ensinar-me o que esta frase deve significar?"
    }
    return answers.get(intent, answers["unknown"])


@app.get("/health")
def health():
    return {"status": "ok", "name": "WYZEN", "model": "own-intent-engine", "trained_model": MODEL_PATH.exists()}


@app.post("/v1/chat")
def chat(payload: ChatInput):
    intent = classify(payload.message)
    answer = answer_for(intent, payload.message)
    connection = db()
    connection.execute(
        "INSERT INTO memories(user_id, message, answer, created_at) VALUES (?, ?, ?, ?)",
        (payload.user_id, payload.message, answer, datetime.now(timezone.utc).isoformat())
    )
    connection.commit()
    connection.close()
    return {"answer": answer, "intent": intent, "engine": "wyzen-own-engine", "actions": []}


@app.post("/v1/train")
def add_training_example(example: TrainingExample, authorization: Optional[str] = Header(default=None)):
    if not ADMIN_TOKEN or authorization != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Admin authentication required")
    connection = db()
    connection.execute(
        "INSERT INTO training_examples(text, intent) VALUES (?, ?)",
        (example.text, example.intent)
    )
    connection.commit()
    connection.close()
    return {"saved": True, "message": "Exemplo guardado. Treina o classificador para o incorporar."}


@app.post("/v1/train/model")
def train_model(authorization: Optional[str] = Header(default=None)):
    if not ADMIN_TOKEN or authorization != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Admin authentication required")
    connection = db()
    rows = connection.execute("SELECT text, intent FROM training_examples").fetchall()
    connection.close()
    if len(rows) < 12 or len({row[1] for row in rows}) < 2:
        raise HTTPException(status_code=400, detail="Adiciona pelo menos 12 exemplos e 2 intenções diferentes.")
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    import joblib
    model = Pipeline([
        ("text", TfidfVectorizer(analyzer="char", ngram_range=(2, 5), max_features=20000)),
        ("classifier", LogisticRegression(max_iter=1000))
    ])
    model.fit([row[0] for row in rows], [row[1] for row in rows])
    joblib.dump(model, MODEL_PATH)
    return {"trained": True, "examples": len(rows), "intents": sorted({row[1] for row in rows})}

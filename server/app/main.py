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

app = FastAPI(title="WYZEN Conversational Intelligence", version="0.2.0")


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    user_id: str = Field(default="android-user", min_length=1, max_length=100)
    memory_context: str = Field(default="", max_length=12000)


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


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()


def classify(text: str) -> str:
    value = normalize(text)
    patterns = {
        "greeting": r"\b(olá|ola|bom dia|boa tarde|boa noite|oi|hey)\b",
        "thanks": r"\b(obrigad[oa]s?|agradeço|valeu)\b",
        "farewell": r"\b(adeus|até logo|ate logo|até amanhã|ate amanha|tchau|vou dormir)\b",
        "identity": r"\b(quem és|quem e voce|quem és tu|o que és|o que e voce|fala de ti)\b",
        "creator": r"\b(quem te criou|quem criou você|quem criou voce|teu criador)\b",
        "capabilities": r"\b(o que sabes fazer|no que podes ajudar|quais são as tuas funções|capacidades)\b",
        "time": r"\b(que horas|horas são|hora atual)\b",
        "planning": r"\b(planear|planejar|organizar|agenda|plano|prioridades)\b",
        "learning": r"\b(aprender|ensinar|explicar|estudar|treinar)\b",
        "search": r"\b(pesquisar|procurar|buscar|pesquisa)\b",
        "translation": r"\b(traduz|traduzir|tradução)\b",
        "opinion": r"\b(o que achas|qual é a tua opinião|o que pensas|na tua opinião)\b",
        "clarification": r"\b(não percebi|nao percebi|explica melhor|como assim|não entendi|nao entendi)\b",
    }
    for intent, pattern in patterns.items():
        if re.search(pattern, value):
            return intent

    # A trained classifier may add new intents, but never overrides clear dialogue rules.
    if MODEL_PATH.exists():
        try:
            import joblib
            model = joblib.load(MODEL_PATH)
            prediction = str(model.predict([text])[0])
            if prediction not in {"unknown", "greeting", "thanks", "farewell", "identity", "creator"}:
                return prediction
        except Exception:
            pass
    return "followup" if len(value.split()) <= 5 else "unknown"


def recent_context(connection, user_id: str):
    rows = connection.execute(
        "SELECT message, answer FROM memories WHERE user_id=? ORDER BY id DESC LIMIT 6",
        (user_id,)
    ).fetchall()
    return list(reversed(rows))


def answer_for(intent: str, message: str, context, memory_context: str = "") -> str:
    last_user = context[-1][0] if context else ""
    last_answer = context[-1][1] if context else ""
    value = normalize(message)
    memories = [line.strip()[2:] for line in memory_context.splitlines() if line.strip().startswith("- ")][:12]
    memory_hint = (" Tenho também estas notas que me pediste para guardar: " + "; ".join(memories[:4]) + ".") if memories else ""

    if intent == "greeting":
        return "Olá! Estou aqui. Podemos conversar normalmente ou trabalhar numa tarefa passo a passo. O que queres resolver?"
    if intent == "thanks":
        return "De nada. Continuo disponível — podemos avançar para o próximo passo quando quiseres."
    if intent == "farewell":
        return "Até já. Quando voltares, retomamos a conversa a partir do que estiver guardado neste dispositivo."
    if intent == "identity":
        return "Sou a WYZEN, uma assistente pessoal em desenvolvimento. Combino regras de diálogo, contexto recente e um classificador próprio; não sou ainda um modelo generativo geral."
    if intent == "creator":
        return "O meu criador é Podolsky Wyzen P. O projeto está a ser construído manualmente no GitHub."
    if intent == "capabilities":
        return "Neste momento consigo interpretar comandos definidos, apoiar planeamento, gerir tarefas e memória local no Android e preparar algumas ações do telefone. A conversa contextual está em evolução; pesquisa web, leitura da caixa de SMS e voz contínua em segundo plano ainda não estão ligadas."
    if intent == "time":
        return "A hora do servidor é " + datetime.now().astimezone().strftime("%H:%M") + ". Para a hora exata do telefone, usa o comando local no Android."
    if intent == "planning":
        if re.search(r"\b(hoje|amanha|amanhã|semana|projeto|projecto)\b", value):
            return "Vou organizar o plano em objetivo, tarefas, ordem e prazo. Primeiro, diz-me qual é o resultado concreto que queres alcançar e qual é o prazo." + memory_hint
        return "Vamos estruturar isso em objetivo, etapas, prioridades e prazo. Qual é o resultado concreto que queres alcançar?" + memory_hint
    if intent == "learning":
        return "Posso trabalhar contigo por etapas: explico, dou um exemplo e ajusto a explicação com base na tua correção. Que assunto queres aprender?"
    if intent == "search":
        return "A pesquisa externa ainda não está integrada neste servidor. Posso ajudar a formular a pesquisa ou analisar o conteúdo que partilhares."
    if intent == "translation":
        return "Envia o texto e indica o idioma de destino. Posso ajudar com traduções simples, mas deves rever expressões técnicas ou oficiais."
    if intent == "opinion":
        return "Posso analisar opções, vantagens, riscos e consequências. Vou separar os factos das suposições. Qual é a situação concreta?" + memory_hint
    if intent == "clarification":
        return "Claro. A minha última resposta foi: " + (last_answer[:900] if last_answer else "ainda não há uma resposta anterior nesta sessão") + ". Que parte queres que eu esclareça?"
    if intent == "followup" and last_user:
        return "Estou a acompanhar o assunto anterior: «" + last_user[:220] + "». A última resposta foi: «" + last_answer[:350] + "». O que queres corrigir, aprofundar ou decidir?" + memory_hint
    if memories:
        return "Quero perceber melhor o teu pedido antes de concluir. Vou considerar as notas que guardaste: " + "; ".join(memories[:4]) + ". Podes dar-me um exemplo ou dizer qual é o resultado que esperas?"
    return "Quero perceber corretamente antes de responder. Qual é o objetivo principal e que resultado esperas? Se preferires, dá-me um exemplo concreto."


@app.get("/health")
def health():
    return {
        "status": "ok",
        "name": "WYZEN",
        "engine": "wyzen-native-dialogue-engine",
        "trained_model": MODEL_PATH.exists(),
        "external_models": False,
        "features": ["intent-routing", "recent-turn-context", "saved-user-memory-context", "dialogue-state", "clarification", "trainable-intent-classifier"]
    }


@app.post("/v1/chat")
def chat(payload: ChatInput):
    connection = db()
    context = recent_context(connection, payload.user_id)
    intent = classify(payload.message)
    answer = answer_for(intent, payload.message, context, payload.memory_context)
    connection.execute(
        "INSERT INTO memories(user_id, message, answer, created_at) VALUES (?, ?, ?, ?)",
        (payload.user_id, payload.message, answer, datetime.now(timezone.utc).isoformat())
    )
    connection.commit()
    connection.close()
    return {
        "answer": answer,
        "intent": intent,
        "engine": "wyzen-native-dialogue-engine",
        "context_turns": min(len(context), 6),
        "memory_notes_used": min(len([line for line in payload.memory_context.splitlines() if line.strip().startswith("- ")]), 12),
        "actions": []
    }


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

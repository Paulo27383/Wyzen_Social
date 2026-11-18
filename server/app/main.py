import os
import re
import hmac
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

app = FastAPI(title="WYZEN Native Conversational Engine", version="0.3.0")


class ChatInput(BaseModel):
    # Public chat is stateless until per-user authentication exists.
    message: str = Field(min_length=1, max_length=4000)


class TrainingExample(BaseModel):
    text: str = Field(min_length=2, max_length=1000)
    intent: str = Field(min_length=2, max_length=80)


def db():
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.execute("PRAGMA journal_mode=WAL")
    # Conversation content is no longer stored on the server.
    # Existing legacy memories tables are left untouched; see server/README.md.
    connection.execute("""CREATE TABLE IF NOT EXISTS training_examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        intent TEXT NOT NULL
    )""")
    return connection


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()


RULES = {
    "greeting": r"\b(olá|ola|bom dia|boa tarde|boa noite|oi|hey|olá wyzen)\b",
    "thanks": r"\b(obrigad[oa]s?|agradeço|valeu|muito obrigado)\b",
    "farewell": r"\b(adeus|até logo|ate logo|até amanhã|ate amanha|tchau|vou dormir)\b",
    "identity": r"\b(quem és|quem e voce|quem és tu|o que és|o que e voce|fala de ti)\b",
    "creator": r"\b(quem te criou|quem criou você|quem criou voce|teu criador)\b",
    "capabilities": r"\b(o que sabes fazer|no que podes ajudar|quais são as tuas funções|capacidades)\b",
    "time": r"\b(que horas|horas são|hora atual)\b",
    "planning": r"\b(planear|planejar|organizar|agenda|plano|prioridades|planeamento)\b",
    "learning": r"\b(aprender|ensinar|explicar|estudar|treinar|como funciona)\b",
    "search": r"\b(pesquisar|procurar|buscar|pesquisa|informações sobre)\b",
    "translation": r"\b(traduz|traduzir|tradução)\b",
    "opinion": r"\b(o que achas|qual é a tua opinião|o que pensas|na tua opinião)\b",
    "comparison": r"\b(compara|comparar|diferença entre|qual é melhor|qual melhor)\b",
    "summary": r"\b(resume|resumir|resumo|sintetiza|síntese)\b",
    "creative": r"\b(escreve|cria um texto|inventa|história|poema|mensagem para|redige)\b",
    "coding": r"\b(código|programar|programação|erro no código|bug|typescript|python|javascript)\b",
    "problem_solving": r"\b(problema|resolver|solução|ajuda-me|ajuda me|não consigo|nao consigo)\b",
    "clarification": r"\b(não percebi|nao percebi|explica melhor|como assim|não entendi|nao entendi)\b",
}


def classify(text: str) -> str:
    value = normalize(text)
    for intent, pattern in RULES.items():
        if re.search(pattern, value):
            return intent

    # The model learns only from examples supplied to WYZEN. It never
    # overrides explicit dialogue rules and low-confidence guesses are ignored.
    if MODEL_PATH.exists():
        try:
            import joblib
            model = joblib.load(MODEL_PATH)
            probabilities = model.predict_proba([text])[0]
            best_index = int(probabilities.argmax())
            if float(probabilities[best_index]) >= 0.42:
                prediction = str(model.classes_[best_index])
                if prediction not in {"unknown", "greeting", "thanks", "farewell", "identity", "creator"}:
                    return prediction
        except Exception:
            pass

    if len(value.split()) <= 5:
        return "followup"
    return "conversation"


def answer_for(intent: str, message: str, context, memory_context: str = "") -> str:
    value = normalize(message)
    last_user = context[-1][0] if context else ""
    last_answer = context[-1][1] if context else ""
    memories = memory_notes(memory_context)
    memory_hint = (" Vou também considerar as notas que guardaste: " +
                   "; ".join(memories[:3]) + ".") if memories else ""

    if intent == "greeting":
        return "Olá! Sou a WYZEN. Estou pronta para conversar, compreender o que pretendes e ajudar-te a organizar ideias ou tarefas. O que vamos tratar?"
    if intent == "thanks":
        return "De nada. Continuo contigo. Podemos desenvolver a ideia, rever o resultado ou avançar para outra tarefa."
    if intent == "farewell":
        return "Até já. A conversa fica guardada no meu histórico deste servidor para podermos retomar quando voltares."
    if intent == "identity":
        return "Sou a WYZEN, uma assistente pessoal com um motor conversacional desenvolvido para este projeto. Uso regras próprias de diálogo, contexto recente, memória fornecida pelo dispositivo e um classificador que pode ser treinado com exemplos. Não sou ainda um modelo generativo geral; quando não tiver conhecimento suficiente, devo dizê-lo."
    if intent == "creator":
        return "Fui criada por Podolsky Wyzen P. O meu desenvolvimento é feito no projeto WYZEN AI."
    if intent == "capabilities":
        return ("O meu núcleo atual consegue classificar intenções, acompanhar até oito turnos recentes, considerar notas de memória, responder a saudações, apoiar planeamento, aprendizagem, comparação, escrita, programação e resolução estruturada de problemas. "
                "Ações Android continuam a ser executadas pelos módulos locais da aplicação e exigem permissões e confirmações apropriadas.")
    if intent == "time":
        return "A hora registada pelo servidor é " + datetime.now().astimezone().strftime("%H:%M") + ". Para a hora exata do teu telefone, a aplicação consulta o relógio local."
    if intent == "planning":
        return "Vamos transformar isso num plano verificável. Vou separar o resultado pretendido, as tarefas, a ordem de prioridade, os recursos necessários e o prazo. Qual é o resultado final que queres alcançar?" + memory_hint
    if intent == "learning":
        return "Posso explicar o assunto, apresentar um exemplo e depois propor uma pequena verificação para confirmar a compreensão. Qual é o tema ou conceito que queres estudar?"
    if intent == "search":
        return "O meu servidor próprio ainda não tem acesso direto à pesquisa na Internet. Posso analisar informação que partilhares, organizar perguntas de pesquisa ou explicar o que já conheço, distinguindo o que não consigo confirmar."
    if intent == "translation":
        return "Envia o texto completo e indica o idioma de destino. Vou preservar o sentido e assinalar expressões ambíguas."
    if intent == "opinion":
        return "Vou avaliar a questão separando factos, pressupostos, vantagens, riscos e consequências. Qual é a situação concreta que queres analisar?" + memory_hint
    if intent == "comparison":
        return "Para comparar corretamente, vou usar os mesmos critérios para cada opção: objetivo, vantagens, limitações, custo ou esforço e riscos. Quais são as opções que queres comparar?"
    if intent == "summary":
        if last_user and last_answer:
            return "Resumo do último ponto da conversa: pediste «" + last_user[:240] + "» e respondi «" + last_answer[:500] + "». Se enviares o texto ou indicares o tema completo, preparo um resumo mais abrangente."
        return "Envia o texto, documento ou tema que queres resumir e digo-te os pontos essenciais, sem acrescentar informação que não esteja na fonte."
    if intent == "creative":
        return "Posso preparar esse conteúdo com uma estrutura e um tom adequados. Diz-me o destinatário ou público e o objetivo da mensagem." + memory_hint
    if intent == "coding":
        return "Posso ajudar a analisar a lógica, localizar erros e propor alterações. Partilha o trecho de código, a mensagem de erro e o comportamento que esperavas."
    if intent == "problem_solving":
        return "Vamos decompor o problema: o que aconteceu, qual era o resultado esperado, o que já tentaste e qual é a principal limitação? Com esses dados posso propor uma solução verificável."
    if intent == "clarification":
        return "Claro. A minha resposta anterior foi: «" + (last_answer[:850] if last_answer else "ainda não existe uma resposta anterior nesta conversa") + "». Indica a parte que ficou pouco clara e reformulo-a."
    if intent == "followup" and last_user:
        return "Estou a acompanhar o assunto anterior: «" + last_user[:220] + "». A última resposta foi: «" + last_answer[:420] + "». Queres aprofundar, corrigir ou avançar para uma decisão?" + memory_hint
    if memories:
        return ("Percebo o pedido: «" + message[:500] + "». Ainda não tenho dados suficientes para dar uma resposta segura. "
                "Posso usar estas notas que guardaste como contexto: " + "; ".join(memories[:4]) +
                ". Que resultado concreto esperas obter?")
    if context:
        return ("Quero responder de forma útil, mas ainda não tenho conhecimento suficiente para concluir apenas com esta mensagem: «" +
                message[:500] + "». Posso relacioná-la com o tema anterior ou analisar um exemplo concreto. O que é mais importante neste pedido?")
    return ("Recebi o teu pedido: «" + message[:500] + "». O meu motor próprio ainda está a evoluir e não vou inventar uma resposta quando não tenho base suficiente. "
            "Dá-me um pouco mais de contexto ou um exemplo do resultado que esperas.")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "name": "WYZEN",
        "engine": "wyzen-native-dialogue-engine",
        "engine_version": "0.3.0",
        "trained_model": MODEL_PATH.exists(),
        "external_models": False,
        "features": [
            "native-intent-routing", "recent-turn-context", "device-memory-context",
            "dialogue-state", "clarification", "comparison", "planning",
            "learning", "creative-writing-routing", "coding-help-routing",
            "trainable-intent-classifier"
        ]
    }


@app.post("/v1/chat")
def chat(payload: ChatInput):
    # Stateless response: no client-supplied identity, no server history, no personal memory.
    intent = classify(payload.message)
    answer = answer_for(intent, payload.message, [])
    return {
        "answer": answer,
        "intent": intent,
        "engine": "wyzen-native-dialogue-engine",
        "context_turns": 0,
        "memory_notes_used": 0,
        "actions": []
    }


@app.post("/v1/train")
def add_training_example(example: TrainingExample, authorization: Optional[str] = Header(default=None)):
    if not ADMIN_TOKEN or not hmac.compare_digest(authorization or "", f"Bearer {ADMIN_TOKEN}"):
        raise HTTPException(status_code=401, detail="Admin authentication required")
    connection = db()
    try:
        connection.execute(
            "INSERT INTO training_examples(text, intent) VALUES (?, ?)",
            (example.text, example.intent)
        )
        connection.commit()
        count = connection.execute("SELECT COUNT(*) FROM training_examples").fetchone()[0]
        return {"saved": True, "examples": count, "message": "Exemplo guardado. Treina o classificador para o incorporar."}
    finally:
        connection.close()


@app.post("/v1/train/model")
def train_model(authorization: Optional[str] = Header(default=None)):
    if not ADMIN_TOKEN or authorization != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Admin authentication required")
    connection = db()
    try:
        rows = connection.execute("SELECT text, intent FROM training_examples").fetchall()
    finally:
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

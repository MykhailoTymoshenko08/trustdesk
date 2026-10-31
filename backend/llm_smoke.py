"""live smoke check: LLM_MODE=live GEMINI_API_KEY=... python llm_smoke.py"""
from pydantic import BaseModel

from app.config import get_settings
from app.llm import get_llm


class Pong(BaseModel):
    answer: int


if __name__ == "__main__":
    s = get_settings()
    print("mode:", s.llm_mode, "model:", s.gemma_model, "embed:", s.embed_model)
    llm = get_llm()
    print(llm.generate_json("What is 2+2? Answer in the 'answer' field.", Pong))
    print("embed dim:", len(llm.embed(["hello"])[0]))
